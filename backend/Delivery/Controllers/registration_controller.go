package controllers

import (
	"errors"
	"net/http"
	"time"

	domain "bridge/Domain"

	"github.com/gin-gonic/gin"
)

type RegistrationController struct {
	RegistrationUc domain.RegistrationUsecaseI
}

func NewRegistrationController(uc domain.RegistrationUsecaseI) *RegistrationController {
	return &RegistrationController{
		RegistrationUc: uc,
	}
}

// POST /api/v1/registrations
func (rc *RegistrationController) CreateRegistrationController(c *gin.Context) { notImplemented(c) }

// GET /api/v1/registrations/:id
func (rc *RegistrationController) GetRegistrationController(c *gin.Context) { notImplemented(c) }

// PATCH /api/v1/registrations/:id
func (rc *RegistrationController) UpdateProgressController(c *gin.Context) { notImplemented(c) }

// PUT /api/v1/registrations/:id/answers/:questionId
func (rc *RegistrationController) SaveAnswerController(c *gin.Context) { notImplemented(c) }

// POST /api/v1/registrations/:id/submit
func (rc *RegistrationController) SubmitRegistrationController(c *gin.Context) { notImplemented(c) }

// POST /api/v1/resume/lookup
func (rc *RegistrationController) ResumeLookupController(c *gin.Context) {
	if rc.RegistrationUc == nil {
		notImplemented(c)
		return
	}

	var req ResumeLookupRequest
	if !bindJSON(c, &req) {
		return
	}

	codeOrToken := req.Code
	if codeOrToken == "" {
		codeOrToken = req.Token
	}
	if codeOrToken == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, ErrorResponse{
			Status: http.StatusBadRequest,
			Code:   "invalid_request",
			Title:  "Code or token is required",
		})
		return
	}

	result, err := rc.RegistrationUc.ResumeLookup(c.Request.Context(), codeOrToken)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			c.AbortWithStatusJSON(http.StatusNotFound, ErrorResponse{
				Status: http.StatusNotFound,
				Code:   "resume_not_found",
				Title:  "Resume session not found",
			})
			return
		}
		if errors.Is(err, domain.ErrResumeExpired) {
			c.AbortWithStatusJSON(http.StatusGone, ErrorResponse{
				Status: http.StatusGone,
				Code:   "resume_expired",
				Title:  "Resume token or code has expired",
			})
			return
		}
		if errors.Is(err, domain.ErrTooManyAttempts) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, ErrorResponse{
				Status: http.StatusTooManyRequests,
				Code:   "too_many_attempts",
				Title:  "Too many failed verification attempts",
			})
			return
		}

		c.AbortWithStatusJSON(http.StatusInternalServerError, ErrorResponse{
			Status: http.StatusInternalServerError,
			Code:   "internal_error",
			Title:  "Failed to lookup resume session",
		})
		return
	}

	c.JSON(http.StatusOK, ResumeLookupResponse{
		RegistrationID: result.RegistrationID,
		Check:          result.Check,
	})
}

// POST /api/v1/resume/verify
func (rc *RegistrationController) ResumeVerifyController(c *gin.Context) {
	if rc.RegistrationUc == nil {
		notImplemented(c)
		return
	}

	var req ResumeVerifyRequest
	if !bindJSON(c, &req) {
		return
	}

	codeOrToken := req.Code
	if codeOrToken == "" {
		codeOrToken = req.Token
	}
	if codeOrToken == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, ErrorResponse{
			Status: http.StatusBadRequest,
			Code:   "invalid_request",
			Title:  "Code or token is required",
		})
		return
	}

	var dob *domain.ResumeDOB
	if req.DOB != nil {
		dob = &domain.ResumeDOB{
			Calendar: req.DOB.Calendar,
			Year:     req.DOB.Year,
			Month:    req.DOB.Month,
			Day:      req.DOB.Day,
		}
	}

	result, attemptsLeft, err := rc.RegistrationUc.ResumeVerify(c.Request.Context(), codeOrToken, dob, req.PhoneLast4)
	if err != nil {
		if errors.Is(err, domain.ErrResumeCheckFailed) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"status":        http.StatusUnauthorized,
				"code":          "resume_check_failed",
				"title":         "Resume verification check failed",
				"attempts_left": attemptsLeft,
			})
			return
		}
		if errors.Is(err, domain.ErrNotFound) {
			c.AbortWithStatusJSON(http.StatusNotFound, ErrorResponse{
				Status: http.StatusNotFound,
				Code:   "resume_not_found",
				Title:  "Resume session not found",
			})
			return
		}
		if errors.Is(err, domain.ErrResumeExpired) {
			c.AbortWithStatusJSON(http.StatusGone, ErrorResponse{
				Status: http.StatusGone,
				Code:   "resume_expired",
				Title:  "Resume token or code has expired",
			})
			return
		}
		if errors.Is(err, domain.ErrTooManyAttempts) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, ErrorResponse{
				Status: http.StatusTooManyRequests,
				Code:   "too_many_attempts",
				Title:  "Too many failed verification attempts",
			})
			return
		}

		c.AbortWithStatusJSON(http.StatusInternalServerError, ErrorResponse{
			Status: http.StatusInternalServerError,
			Code:   "internal_error",
			Title:  "Failed to verify resume session",
		})
		return
	}

	c.JSON(http.StatusOK, ResumeVerifyResponse{
		RegistrationID: result.RegistrationID,
		Session: SessionDTO{
			Token:     result.SessionToken,
			ExpiresAt: result.ExpiresAt.UTC().Format(time.RFC3339),
		},
	})
}

// POST /api/v1/partner/registrations/:id/consent-code
func (rc *RegistrationController) SendConsentCodeController(c *gin.Context) {
	if rc.RegistrationUc == nil {
		notImplemented(c)
		return
	}

	regID, ok := uuidParam(c, "id")
	if !ok {
		return
	}

	var req SendConsentCodeRequest
	_ = c.ShouldBindJSON(&req)

	phone, err := rc.RegistrationUc.SendConsentCode(c.Request.Context(), regID, req.Phone)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			c.AbortWithStatusJSON(http.StatusNotFound, ErrorResponse{
				Status: http.StatusNotFound,
				Code:   "not_found",
				Title:  "Registration not found",
			})
			return
		}

		c.AbortWithStatusJSON(http.StatusBadRequest, ErrorResponse{
			Status: http.StatusBadRequest,
			Code:   "invalid_request",
			Title:  err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, SendConsentCodeResponse{
		Status:    "sent",
		Phone:     phone,
		ExpiresIn: 600,
	})
}

// POST /api/v1/telegram/webhook
func (rc *RegistrationController) TelegramWebhookController(c *gin.Context) {
	if rc.RegistrationUc == nil {
		notImplemented(c)
		return
	}

	var update domain.TelegramUpdate
	if err := c.ShouldBindJSON(&update); err != nil {
		c.JSON(http.StatusOK, TelegramWebhookResponse{OK: true})
		return
	}

	_ = rc.RegistrationUc.HandleTelegramWebhook(c.Request.Context(), &update)

	c.JSON(http.StatusOK, TelegramWebhookResponse{OK: true})
}
