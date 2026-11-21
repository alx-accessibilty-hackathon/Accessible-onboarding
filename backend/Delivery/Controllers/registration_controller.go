package controllers

import (
	"errors"
	"net/http"
	"time"

	domain "bridge/Domain"
	infrastructure "bridge/Infrastructure"

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
// Starts a sign-up: a draft learner and registration, plus a learner token for this device.
func (rc *RegistrationController) CreateRegistrationController(c *gin.Context) {
	var req CreateRegistrationRequest
	if !bindJSON(c, &req) {
		return
	}
	reg, token, expiresAt, err := rc.RegistrationUc.Start(c.Request.Context(), infrastructure.ActorFrom(c),
		req.FlowID, req.FlowVersion, req.Language, req.SimpleMode)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, toCreateRegistrationResponse(reg, token, expiresAt))
}

// GET /api/v1/registrations/:id
// Everything needed to continue: status, current step, preferences and saved answers.
func (rc *RegistrationController) GetRegistrationController(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	view, err := rc.RegistrationUc.Get(c.Request.Context(), infrastructure.ActorFrom(c), id)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, toRegistrationDTO(view.Registration, view.Learner, view.Answers, view.SupportSubmitted))
}

// PATCH /api/v1/registrations/:id
// Saves the current step, language or Simple mode. Answers 204 No Content.
func (rc *RegistrationController) UpdateProgressController(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	var req UpdateProgressRequest
	if !bindJSON(c, &req) {
		return
	}
	err := rc.RegistrationUc.UpdateProgress(c.Request.Context(), infrastructure.ActorFrom(c), id,
		req.CurrentStep, req.Language, req.SimpleMode)
	if err != nil {
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// PUT /api/v1/registrations/:id/answers/:questionId
// Saves one answer with the version check: 200 with the saved answer, 409 with the newer one.
func (rc *RegistrationController) SaveAnswerController(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	var req SaveAnswerRequest
	if !bindJSON(c, &req) {
		return
	}
	answer, err := rc.RegistrationUc.SaveAnswer(c.Request.Context(), infrastructure.ActorFrom(c), id,
		c.Param("questionId"), req.Value, req.InputMethod, req.BaseVersion)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, toAnswerDTO(answer))
}

// POST /api/v1/registrations/:id/submit
// Finishes the sign-up. The body is ignored ({} is fine).
func (rc *RegistrationController) SubmitRegistrationController(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	res, err := rc.RegistrationUc.Submit(c.Request.Context(), infrastructure.ActorFrom(c), id)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, toSubmitRegistrationResponse(res))
}

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

	result, err := rc.RegistrationUc.ResumeLookup(c.Request.Context(), infrastructure.ActorFrom(c), codeOrToken)
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
		Kind:           resumeKind(result.SignIn),
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

	result, attemptsLeft, err := rc.RegistrationUc.ResumeVerify(c.Request.Context(), infrastructure.ActorFrom(c), codeOrToken, dob, req.PhoneLast4)
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
		Kind:           resumeKind(result.SignIn),
		Session: SessionDTO{
			Token:     result.SessionToken,
			ExpiresAt: result.ExpiresAt.UTC().Format(time.RFC3339),
		},
	})
}

// POST /api/v1/partner/registrations/:id/consent-code
// Partner staff: texts a consent code to the learner's stored phone. Answers the masked number.
func (rc *RegistrationController) SendConsentCodeController(c *gin.Context) {
	if rc.RegistrationUc == nil {
		notImplemented(c)
		return
	}
	regID, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	masked, err := rc.RegistrationUc.SendConsentCode(c.Request.Context(), infrastructure.ActorFrom(c), regID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, SendConsentCodeResponse{Status: "sent", Phone: masked, ExpiresIn: 600})
}

// POST /api/v1/registrations/:id/resume-links
// "Continue on another device": a link and a short code (72 hours), optionally sent by SMS.
func (rc *RegistrationController) CreateResumeLinkController(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	var req CreateResumeLinkRequest
	if c.Request.ContentLength != 0 && !bindJSON(c, &req) {
		return
	}
	link, err := rc.RegistrationUc.CreateResumeLink(c.Request.Context(), infrastructure.ActorFrom(c), id, req.SendVia, req.Phone)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, toResumeLinkResponse(link))
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

// GET /api/v1/dev/messages (development only): the simulated SMS / Telegram inbox.
func (rc *RegistrationController) DevMessagesController(c *gin.Context) {
	msgs, err := rc.RegistrationUc.DevMessages(c.Request.Context())
	if err != nil {
		respondError(c, err)
		return
	}
	items := make([]gin.H, 0, len(msgs))
	for _, m := range msgs {
		items = append(items, gin.H{"id": m.ID, "channel": m.Channel, "to": m.Recipient, "body": m.Body, "created_at": m.CreatedAt})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}
