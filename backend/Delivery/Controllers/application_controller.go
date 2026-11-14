package controllers

import (
	domain "bridge/Domain"

	"github.com/gin-gonic/gin"
)

type ApplicationController struct {
	ApplicationUc domain.ApplicationUsecaseI
}

func NewApplicationController(uc domain.ApplicationUsecaseI) *ApplicationController {
	return &ApplicationController{
		ApplicationUc: uc,
	}
}

// POST /api/v1/jobs/:id/applications
func (ac *ApplicationController) CreateApplicationController(c *gin.Context) { notImplemented(c) }
