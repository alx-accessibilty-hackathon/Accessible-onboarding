package usecase

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

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

	t, err := uc.SpeechServ.Transcribe(ctx, audio, language, cloudConsent)
	if err == nil && t != nil && t.Provider == "mock" {
		t.Text = mockSample(stepID, fieldType, language) // a sample that fits the question, for testing
	}
	return t, err
}

// mockSample is what the test voice service "hears": text that fits the field, so testers can
// run voice answers end to end without a real speech provider. The widget labels it as a sample.
func mockSample(stepID, fieldType, language string) string {
	am := strings.HasPrefix(strings.ToLower(language), "am")
	pick := func(en, amh string) string {
		if am {
			return amh
		}
		return en
	}
	switch {
	case fieldType == "phone" || stepID == "phone":
		return pick("zero nine one two three four five six seven eight", "ዜሮ ዘጠኝ አንድ ሁለት ሶስት አራት አምስት ስድስት ሰባት ስምንት")
	case fieldType == "digits" || stepID == "id_last4":
		return pick("four eight two one", "አራት ስምንት ሁለት አንድ")
	case stepID == "full_name":
		return pick("Abebe Kebede", "አበበ ከበደ")
	case stepID == "preferred_name":
		return pick("Abe", "አቤ")
	case fieldType == "long_text":
		return pick("I would like to learn and find work.", "መማር እና ሥራ ማግኘት እፈልጋለሁ።")
	default:
		return pick("sample answer", "የሙከራ መልስ")
	}
}

const maxSpeechText = 600 // characters

// Synthesize reads fixed interface text aloud. The text is not personal data: the widget only
// sends questions, options, buttons and messages here (requirement Q2).
func (uc *SpeechUsecase) Synthesize(ctx context.Context, text, language string) ([]byte, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, domain.NewValidationError("text", codeRequired)
	}
	if utf8.RuneCountInString(text) > maxSpeechText {
		return nil, domain.NewValidationError("text", codeTooLong)
	}
	if uc.SpeechServ == nil {
		return nil, domain.ErrSpeechUnavailable
	}
	return uc.SpeechServ.Synthesize(ctx, text, language)
}
