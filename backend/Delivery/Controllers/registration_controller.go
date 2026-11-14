package controllers

import (
	"net/http"

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
