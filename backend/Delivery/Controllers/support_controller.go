package controllers

import (
	domain "bridge/Domain"

	"github.com/gin-gonic/gin"
)

type SupportController struct {
	SupportUc domain.SupportUsecaseI
}

func NewSupportController(uc domain.SupportUsecaseI) *SupportController {
	return &SupportController{
		SupportUc: uc,
	}
}

// PUT /api/v1/registrations/:id/support-request
func (sc *SupportController) SaveSupportRequestController(c *gin.Context) { notImplemented(c) }
