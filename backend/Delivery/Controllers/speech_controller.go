package controllers

import (
	"errors"
	"io"
	"net/http"

	domain "bridge/Domain"
	infrastructure "bridge/Infrastructure"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type SpeechController struct {
	SpeechUc domain.SpeechUsecaseI
}

func NewSpeechController(uc domain.SpeechUsecaseI) *SpeechController {
	return &SpeechController{
		SpeechUc: uc,
	}
}

// POST /api/v1/speech/transcriptions (multipart: audio, language, step_id, field_type)
func (sc *SpeechController) TranscribeController(c *gin.Context) {
	if sc.SpeechUc == nil {
		notImplemented(c)
		return
	}

	// Refuse big uploads while reading them, not after they are stored (3 MB audio + form overhead).
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4<<20)

	var req TranscribeRequest
	if !bindForm(c, &req) {
		return
	}

	if req.Audio == nil || req.Audio.Size == 0 {
		c.AbortWithStatusJSON(http.StatusUnprocessableEntity, ErrorResponse{
			Status: http.StatusUnprocessableEntity,
			Code:   "validation_failed",
			Errors: []FieldError{{Field: "audio", Code: "required"}},
		})
		return
	}

	if req.Audio.Size > 3*1024*1024 {
		c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, ErrorResponse{
			Status: http.StatusRequestEntityTooLarge,
			Code:   "payload_too_large",
			Title:  "Audio file exceeds 3 MB limit",
		})
		return
	}

	f, err := req.Audio.Open()
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, ErrorResponse{
			Status: http.StatusBadRequest,
			Code:   "invalid_request",
			Title:  "Could not read audio file",
		})
		return
	}
	defer f.Close()

	audioBytes, err := io.ReadAll(f)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, ErrorResponse{
			Status: http.StatusBadRequest,
			Code:   "invalid_request",
			Title:  "Could not read audio file",
		})
		return
	}

	var learnerID *uuid.UUID
	if actor := infrastructure.ActorFrom(c); actor.Kind == domain.ActorLearner {
		learnerID = &actor.ID
	}

	transcription, err := sc.SpeechUc.Transcribe(c.Request.Context(), audioBytes, req.Language, req.StepID, req.FieldType, learnerID)
	if err != nil {
		if errors.Is(err, domain.ErrSpeechUnavailable) {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, ErrorResponse{
				Status: http.StatusServiceUnavailable,
				Code:   "speech_unavailable",
				Title:  "Speech service unavailable",
			})
			return
		}
		if errors.Is(err, domain.ErrPayloadTooLarge) {
			c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, ErrorResponse{
				Status: http.StatusRequestEntityTooLarge,
				Code:   "payload_too_large",
				Title:  "Audio file exceeds limit",
			})
			return
		}

		c.AbortWithStatusJSON(http.StatusInternalServerError, ErrorResponse{
			Status: http.StatusInternalServerError,
			Code:   "internal_error",
			Title:  "Failed to transcribe audio",
		})
		return
	}

	c.JSON(http.StatusOK, toTranscriptionDTO(transcription))
}
