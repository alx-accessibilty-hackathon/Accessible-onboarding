package controllers

import (
	domain "bridge/Domain"

	"github.com/gin-gonic/gin"
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
func (sc *SpeechController) TranscribeController(c *gin.Context) { notImplemented(c) }
