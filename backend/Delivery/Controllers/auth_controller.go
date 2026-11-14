package controllers

import (
	domain "bridge/Domain"

	"github.com/gin-gonic/gin"
)

type AuthController struct {
	AuthUc domain.AuthUsecaseI
}

func NewAuthController(uc domain.AuthUsecaseI) *AuthController {
	return &AuthController{
		AuthUc: uc,
	}
}

// POST /api/v1/auth/logout (learner or staff token)
func (ac *AuthController) LogoutController(c *gin.Context) { notImplemented(c) }

// POST /api/v1/auth/staff/login
func (ac *AuthController) StaffLoginController(c *gin.Context) { notImplemented(c) }

// GET /api/v1/auth/staff/me
func (ac *AuthController) StaffMeController(c *gin.Context) { notImplemented(c) }

// POST /api/v1/oauth/token (client credentials, form-encoded body)
func (ac *AuthController) OAuthTokenController(c *gin.Context) { notImplemented(c) }
