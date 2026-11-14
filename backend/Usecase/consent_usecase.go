package usecase

import (
	"context"
	"errors"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

var (
	validConsentKinds = map[string]bool{
		"data_processing": true,
		"cloud_speech":    true,
		"sms":             true,
		"telegram":        true,
		"partner_access":  true,
	}

	validConsentMethods = map[string]bool{
		"tap":               true,
		"sms_code":          true,
		"spoken":            true,
		"partner_witnessed": true,
	}
)

// ConsentUsecase records consents (data use, cloud speech, SMS, partner access).
type ConsentUsecase struct {
	ConsentRepo      domain.ConsentRepositoryI
	RegistrationRepo domain.RegistrationRepositoryI
}

var _ domain.ConsentUsecaseI = (*ConsentUsecase)(nil)

func NewConsentUsecase(crp domain.ConsentRepositoryI, rrp ...domain.RegistrationRepositoryI) *ConsentUsecase {
	uc := &ConsentUsecase{
		ConsentRepo: crp,
	}
	if len(rrp) > 0 {
		uc.RegistrationRepo = rrp[0]
	}
	return uc
}

func (uc *ConsentUsecase) CreateConsent(ctx context.Context, registrationID uuid.UUID, consent *domain.Consent) (*domain.Consent, error) {
	if registrationID == uuid.Nil {
		return nil, domain.ErrNotFound
	}
	if consent == nil {
		return nil, errors.New("consent cannot be nil")
	}

	if !validConsentKinds[consent.Kind] {
		return nil, errors.New("invalid consent kind")
	}

	if !validConsentMethods[consent.Method] {
		return nil, errors.New("invalid consent method")
	}

	if uc.RegistrationRepo != nil {
		reg, err := uc.RegistrationRepo.GetRegistrationByID(ctx, registrationID)
		if err != nil {
			return nil, err
		}
		consent.LearnerID = reg.LearnerID
	} else if consent.LearnerID == uuid.Nil {
		consent.LearnerID = registrationID
	}

	return uc.ConsentRepo.CreateConsent(ctx, consent)
}
