package controllers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// ErrorResponse is the one error shape every endpoint returns.
// The frontend translates Code into a message in the learner's language.
type ErrorResponse struct {
	Status int          `json:"status"`
	Code   string       `json:"code"`
	Title  string       `json:"title,omitempty"`
	Errors []FieldError `json:"errors,omitempty"`
}

type FieldError struct {
	Field string `json:"field"`
	Code  string `json:"code"`
}

// notImplemented is the placeholder answer for every handler that isn't built yet.
func notImplemented(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, ErrorResponse{
		Status: http.StatusNotImplemented,
		Code:   "not_implemented",
		Title:  "This endpoint is not built yet",
	})
}
