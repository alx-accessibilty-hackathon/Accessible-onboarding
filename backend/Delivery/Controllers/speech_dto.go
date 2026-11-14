package controllers

import (
	"mime/multipart"

	domain "bridge/Domain"
)

// POST /speech/transcriptions  (multipart form)
type TranscribeRequest struct {
	Audio     *multipart.FileHeader `form:"audio" binding:"required"` // max 3 MB / 30 s, checked in the handler
	Language  string                `form:"language" binding:"required,min=2,max=8"`
	StepID    string                `form:"step_id" binding:"omitempty,max=64"`
	FieldType string                `form:"field_type" binding:"omitempty,max=32"`
}

// 200 from POST /speech/transcriptions
type TranscriptionDTO struct {
	Transcript string  `json:"transcript"`
	Confidence float64 `json:"confidence"` // 0..1, or -1 when the provider gives none
	Provider   string  `json:"provider"`
}

func toTranscriptionDTO(t *domain.Transcription) TranscriptionDTO {
	return TranscriptionDTO{Transcript: t.Text, Confidence: t.Confidence, Provider: t.Provider}
}
