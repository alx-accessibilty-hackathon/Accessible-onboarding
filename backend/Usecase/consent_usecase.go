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

// CreateConsent records a consent for the learner of this registration. Only the learner (or
// partner staff helping them, E1) may record it (Q7).
func (uc *ConsentUsecase) CreateConsent(ctx context.Context, actor domain.Actor, registrationID uuid.UUID, consent *domain.Consent) (*domain.Consent, error) {
	if consent == nil {
		return nil, domain.NewValidationError("kind", codeRequired)
	}
	if !validConsentKinds[consent.Kind] {
		return nil, domain.NewValidationError("kind", codeInvalidChoice)
	}
	if !validConsentMethods[consent.Method] {
		return nil, domain.NewValidationError("method", codeInvalidChoice)
	}
	if uc.RegistrationRepo == nil {
		return nil, errors.New("consent use case has no registration repository")
	}
	reg, err := loadOwnedRegistration(ctx, uc.RegistrationRepo, actor, registrationID)
	if err != nil {
		return nil, err
	}
	consent.LearnerID = reg.LearnerID
	if actor.Kind == domain.ActorStaff {
		staffID := actor.ID
		consent.StaffID = &staffID
		if actor.PartnerID != uuid.Nil {
			partnerID := actor.PartnerID
			consent.PartnerID = &partnerID
		}
	}
	return uc.ConsentRepo.CreateConsent(ctx, consent)
}
