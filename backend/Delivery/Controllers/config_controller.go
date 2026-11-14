package controllers

import (
	"errors"
	"net/http"
	"strings"

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

// GET /api/v1/config returns the configuration needed by the frontend onboarding widget
// for the partner specified by X-Partner-Key.
func (cc *ConfigController) GetConfigController(c *gin.Context) {
	if cc.ConfigUc == nil {
		notImplemented(c)
		return
	}

	var partnerKey string
	if pk, ok := c.Get("partner_key"); ok {
		if s, ok := pk.(string); ok {
			partnerKey = strings.TrimSpace(s)
		}
	}
	if partnerKey == "" {
		partnerKey = strings.TrimSpace(c.GetHeader("X-Partner-Key"))
	}
	if partnerKey == "" {
		partnerKey = strings.TrimSpace(c.Query("partner"))
	}
	if partnerKey == "" {
		partnerKey = strings.TrimSpace(c.Query("partner_key"))
	}

	if partnerKey == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, ErrorResponse{
			Status: http.StatusUnauthorized,
			Code:   "unauthorized",
			Title:  "X-Partner-Key header is required",
		})
		return
	}

	cfg, err := cc.ConfigUc.GetConfig(c.Request.Context(), partnerKey)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, ErrorResponse{
				Status: http.StatusUnauthorized,
				Code:   "unauthorized",
				Title:  "Invalid partner key",
			})
			return
		}

		c.AbortWithStatusJSON(http.StatusInternalServerError, ErrorResponse{
			Status: http.StatusInternalServerError,
			Code:   "internal_error",
			Title:  "Failed to load configuration",
		})
		return
	}

	c.JSON(http.StatusOK, toConfigDTO(cfg))
}
