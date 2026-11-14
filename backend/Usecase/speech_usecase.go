package usecase

import (
	"context"
	"errors"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// SpeechUsecase turns audio into text. Cloud providers are only used if the learner
// gave the cloud_speech consent. Audio is never stored.
type SpeechUsecase struct {
	ConsentRepo domain.ConsentRepositoryI
	SpeechServ  domain.SpeechService
}

var _ domain.SpeechUsecaseI = (*SpeechUsecase)(nil)

func NewSpeechUsecase(crp domain.ConsentRepositoryI, sp domain.SpeechService) *SpeechUsecase {
	return &SpeechUsecase{
		ConsentRepo: crp,
		SpeechServ:  sp,
	}
}

func (uc *SpeechUsecase) Transcribe(ctx context.Context, audio []byte, language string, stepID string, fieldType string, learnerID *uuid.UUID) (*domain.Transcription, error) {
	if len(audio) == 0 {
		return nil, errors.New("empty audio")
	}

	if uc.SpeechServ == nil {
		return nil, domain.ErrSpeechUnavailable
	}

	cloudConsent := false
	if learnerID != nil && uc.ConsentRepo != nil {
		consent, err := uc.ConsentRepo.GetConsentByLearnerAndKind(ctx, *learnerID, "cloud_speech")
		if err == nil && consent != nil && consent.Granted && consent.RevokedAt == nil {
			cloudConsent = true
		}
	}

	return uc.SpeechServ.Transcribe(ctx, audio, language, cloudConsent)
}
