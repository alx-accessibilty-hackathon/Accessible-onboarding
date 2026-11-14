package controllers

import (
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
