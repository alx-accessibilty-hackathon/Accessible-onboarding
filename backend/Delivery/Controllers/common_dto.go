package controllers

import (
	"errors"
	"log"
	"net/http"
	"reflect"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
)

// ---- Response shapes shared by every endpoint ----

// ErrorResponse is the one error shape every endpoint returns.
// The frontend translates Code into a message in the learner's language.
type ErrorResponse struct {
	Status int          `json:"status"`
	Code   string       `json:"code"`
	Title  string       `json:"title,omitempty"`
	Errors []FieldError `json:"errors,omitempty"`
}

type FieldError struct {
	Field string `json:"field"` // JSON name of the field, e.g. "input_method"
	Code  string `json:"code"`  // e.g. "required", "too_long", "invalid_choice"
}

// ListResponse wraps every list endpoint: { "items": [...], "next_cursor": "..." | null }.
type ListResponse[T any] struct {
	Items      []T     `json:"items"`
	NextCursor *string `json:"next_cursor"`
}

// SessionDTO is a token handed to the learner's device or to staff.
type SessionDTO struct {
	Token     string `json:"token"`
	ExpiresAt string `json:"expires_at"` // RFC 3339, UTC
}

// ---- Helpers every handler uses ----

// Report validation errors with JSON field names ("input_method"), not Go names ("InputMethod").
func init() {
	if v, ok := binding.Validator.Engine().(*validator.Validate); ok {
		v.RegisterTagNameFunc(func(f reflect.StructField) string {
			for _, tag := range []string{"json", "form"} {
				name := strings.SplitN(f.Tag.Get(tag), ",", 2)[0]
				if name == "-" {
					return ""
				}
				if name != "" {
					return name
				}
			}
			return f.Name
		})
	}
}

// bindJSON reads the JSON body into req and checks its `binding` rules.
// On failure it answers 400 (unreadable JSON) or 422 (rule failures) and returns false.
func bindJSON(c *gin.Context, req any) bool {
	return handleBindError(c, c.ShouldBindJSON(req))
}

// bindQuery reads query parameters (?limit=20&cursor=…) into req.
func bindQuery(c *gin.Context, req any) bool {
	return handleBindError(c, c.ShouldBindQuery(req))
}

// bindForm reads a form or multipart body (OAuth token request, audio upload) into req.
func bindForm(c *gin.Context, req any) bool {
	return handleBindError(c, c.ShouldBind(req))
}

func handleBindError(c *gin.Context, err error) bool {
	if err == nil {
		return true
	}
	var verrs validator.ValidationErrors
	if errors.As(err, &verrs) {
		fields := make([]FieldError, 0, len(verrs))
		for _, fe := range verrs {
			fields = append(fields, FieldError{Field: fe.Field(), Code: ruleToCode(fe.Tag())})
		}
		c.AbortWithStatusJSON(http.StatusUnprocessableEntity, ErrorResponse{
			Status: http.StatusUnprocessableEntity,
			Code:   "validation_failed",
			Errors: fields,
		})
		return false
	}
	log.Print("error : invalid request body: ", err.Error())
	c.AbortWithStatusJSON(http.StatusBadRequest, ErrorResponse{
		Status: http.StatusBadRequest,
		Code:   "invalid_request",
	})
	return false
}

// ruleToCode turns a validator rule into one of our shared error codes.
func ruleToCode(rule string) string {
	switch rule {
	case "required":
		return "required"
	case "max", "lte":
		return "too_long"
	case "min", "gte":
		return "too_short"
	case "oneof", "eq":
		return "invalid_choice"
	case "email":
		return "email_invalid"
	default:
		return "invalid"
	}
}

// uuidParam reads a path parameter as a UUID. On failure it answers 400 invalid_id.
func uuidParam(c *gin.Context, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param(name))
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, ErrorResponse{
			Status: http.StatusBadRequest,
			Code:   "invalid_id",
			Errors: []FieldError{{Field: name, Code: "invalid"}},
		})
		return uuid.Nil, false
	}
	return id, true
}

// notImplemented is the placeholder answer for every handler that isn't built yet.
func notImplemented(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, ErrorResponse{
		Status: http.StatusNotImplemented,
		Code:   "not_implemented",
		Title:  "This endpoint is not built yet",
	})
}
