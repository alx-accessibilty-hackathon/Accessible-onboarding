package controllers

import (
	domain "bridge/Domain"

	"github.com/gin-gonic/gin"
)

type ConsentController struct {
	ConsentUc domain.ConsentUsecaseI
}

func NewConsentController(uc domain.ConsentUsecaseI) *ConsentController {
	return &ConsentController{
		ConsentUc: uc,
	}
}

// POST /api/v1/registrations/:id/consents
func (cc *ConsentController) CreateConsentController(c *gin.Context) { notImplemented(c) }
