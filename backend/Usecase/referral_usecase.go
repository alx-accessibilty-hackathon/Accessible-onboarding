package usecase

import (
	"context"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// ReferralUsecase: the referral queue of a referral organisation such as AAAPD (R7). A
// learner with no ID asked this organisation to contact them; its staff see those referrals
// (name, contact, language; never ID details or support needs) and mark their progress.
type ReferralUsecase struct {
	ReferralRepo domain.ReferralRepositoryI
}

var _ domain.ReferralUsecaseI = (*ReferralUsecase)(nil)

func NewReferralUsecase(rrp domain.ReferralRepositoryI) *ReferralUsecase {
	return &ReferralUsecase{ReferralRepo: rrp}
}

// Statuses partner staff may set. "requested" is where every referral starts.
var referralStatusChanges = map[string]bool{
	domain.ReferralStatusInProgress: true,
	domain.ReferralStatusClosed:     true,
}

// ListPartnerReferrals returns the referrals to the staff member's own organisation, newest first.
func (uc *ReferralUsecase) ListPartnerReferrals(ctx context.Context, actor domain.Actor) ([]*domain.PartnerReferral, error) {
	partnerID, err := partnerStaffOf(actor)
	if err != nil {
		return nil, err
	}
	return uc.ReferralRepo.ListByPartner(ctx, partnerID)
}

// UpdatePartnerReferral sets a referral's status. Another organisation's referral looks like
// it doesn't exist (404), so IDs can't be probed (Q7).
func (uc *ReferralUsecase) UpdatePartnerReferral(ctx context.Context, actor domain.Actor, id uuid.UUID, status string) (*domain.PartnerReferral, error) {
	partnerID, err := partnerStaffOf(actor)
	if err != nil {
		return nil, err
	}
	if !referralStatusChanges[status] {
		return nil, domain.NewValidationError("status", codeInvalidChoice)
	}
	return uc.ReferralRepo.UpdateStatus(ctx, id, partnerID, status)
}

// partnerStaffOf returns the organisation of a partner staff member.
func partnerStaffOf(actor domain.Actor) (uuid.UUID, error) {
	if actor.IsAnonymous() {
		return uuid.Nil, domain.ErrUnauthorized
	}
	if actor.Kind != domain.ActorStaff || actor.Role != domain.RolePartnerStaff || actor.PartnerID == uuid.Nil {
		return uuid.Nil, domain.ErrForbidden
	}
	return actor.PartnerID, nil
}
