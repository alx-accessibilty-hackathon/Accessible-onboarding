package controllers

import (
	"errors"
	"net/http"
	"strings"

	domain "bridge/Domain"
	infrastructure "bridge/Infrastructure"

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

func bearerToken(c *gin.Context) string {
	h := c.GetHeader("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "Bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

// POST /api/v1/auth/logout (learner or staff token): ends that session. 204.
func (ac *AuthController) LogoutController(c *gin.Context) {
	if ac.AuthUc == nil {
		notImplemented(c)
		return
	}
	if err := ac.AuthUc.Logout(c.Request.Context(), bearerToken(c)); err != nil {
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// POST /api/v1/auth/staff/login
// The same 401 for an unknown email and a wrong password.
func (ac *AuthController) StaffLoginController(c *gin.Context) {
	if ac.AuthUc == nil {
		notImplemented(c)
		return
	}
	var req StaffLoginRequest
	if !bindJSON(c, &req) {
		return
	}
	token, expiresAt, staff, err := ac.AuthUc.StaffLogin(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, toStaffLoginResponse(staff, token, expiresAt))
}

// GET /api/v1/auth/staff/me
func (ac *AuthController) StaffMeController(c *gin.Context) {
	if ac.AuthUc == nil {
		notImplemented(c)
		return
	}
	staff, err := ac.AuthUc.StaffMe(c.Request.Context(), infrastructure.ActorFrom(c))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, toStaffDTO(staff))
}

// POST /api/v1/oauth/token (client credentials, form-encoded body)
// Errors use the OAuth 2.0 shape: {"error": "invalid_client"}.
func (ac *AuthController) OAuthTokenController(c *gin.Context) {
	if ac.AuthUc == nil {
		notImplemented(c)
		return
	}
	var req OAuthTokenRequest
	if err := c.ShouldBind(&req); err != nil {
		code := "invalid_request"
		if c.PostForm("grant_type") != "" && c.PostForm("grant_type") != "client_credentials" {
			code = "unsupported_grant_type"
		}
		c.AbortWithStatusJSON(http.StatusBadRequest, OAuthErrorResponse{Error: code})
		return
	}
	token, expiresIn, scope, err := ac.AuthUc.IssuePartnerToken(c.Request.Context(), req.ClientID, req.ClientSecret, req.Scope)
	var verr *domain.ValidationError
	switch {
	case errors.Is(err, domain.ErrUnauthorized):
		c.AbortWithStatusJSON(http.StatusUnauthorized, OAuthErrorResponse{Error: "invalid_client"})
		return
	case errors.As(err, &verr):
		c.AbortWithStatusJSON(http.StatusBadRequest, OAuthErrorResponse{Error: "invalid_scope"})
		return
	case err != nil:
		respondError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, OAuthTokenResponse{AccessToken: token, TokenType: "Bearer", ExpiresIn: expiresIn, Scope: scope})
}
