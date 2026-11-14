package controllers

import (
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// POST /auth/staff/login
type StaffLoginRequest struct {
	Email    string `json:"email" binding:"required,email,max=254"`
	Password string `json:"password" binding:"required,max=200"`
}

// 200 from POST /auth/staff/login
type StaffLoginResponse struct {
	Token       string     `json:"token"`
	ExpiresAt   string     `json:"expires_at"` // RFC 3339, UTC
	Role        string     `json:"role"`
	PartnerID   *uuid.UUID `json:"partner_id"`
	EmployerID  *uuid.UUID `json:"employer_id"`
	DisplayName string     `json:"display_name"`
}

// 200 from GET /auth/staff/me
type StaffDTO struct {
	ID          uuid.UUID  `json:"id"`
	Email       string     `json:"email"`
	DisplayName string     `json:"display_name"`
	Role        string     `json:"role"`
	PartnerID   *uuid.UUID `json:"partner_id"`
	EmployerID  *uuid.UUID `json:"employer_id"`
}

// POST /oauth/token  (form-encoded, as the OAuth 2.0 standard requires)
type OAuthTokenRequest struct {
	GrantType    string `form:"grant_type" binding:"required,eq=client_credentials"`
	ClientID     string `form:"client_id" binding:"required,max=128"`
	ClientSecret string `form:"client_secret" binding:"required,max=256"`
	Scope        string `form:"scope" binding:"omitempty,max=256"`
}

// 200 from POST /oauth/token
type OAuthTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"` // "Bearer"
	ExpiresIn   int    `json:"expires_in"` // seconds
	Scope       string `json:"scope"`
}

// OAuth errors use the standard OAuth shape, not ErrorResponse: {"error":"invalid_client"}.
type OAuthErrorResponse struct {
	Error string `json:"error"` // invalid_request | invalid_client | unsupported_grant_type | invalid_scope
}

func toStaffLoginResponse(s *domain.StaffUser, token string, expiresAt time.Time) StaffLoginResponse {
	return StaffLoginResponse{
		Token:       token,
		ExpiresAt:   expiresAt.UTC().Format(time.RFC3339),
		Role:        s.Role,
		PartnerID:   s.PartnerID,
		EmployerID:  s.EmployerID,
		DisplayName: s.DisplayName,
	}
}

func toStaffDTO(s *domain.StaffUser) StaffDTO {
	return StaffDTO{
		ID:          s.ID,
		Email:       s.Email,
		DisplayName: s.DisplayName,
		Role:        s.Role,
		PartnerID:   s.PartnerID,
		EmployerID:  s.EmployerID,
	}
}
