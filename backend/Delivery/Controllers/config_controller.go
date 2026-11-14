package controllers

import (
	domain "bridge/Domain"

	"github.com/gin-gonic/gin"
)

type ConfigController struct {
	ConfigUc domain.ConfigUsecaseI
}

func NewConfigController(uc domain.ConfigUsecaseI) *ConfigController {
	return &ConfigController{
		ConfigUc: uc,
	}
}

// GET /api/v1/config
func (cc *ConfigController) GetConfigController(c *gin.Context) { notImplemented(c) }
