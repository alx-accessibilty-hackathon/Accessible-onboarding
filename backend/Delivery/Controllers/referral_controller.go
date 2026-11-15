package controllers

import (
	"net/http"

	domain "bridge/Domain"
	infrastructure "bridge/Infrastructure"

	"github.com/gin-gonic/gin"
)

// ReferralController: the referral queue of a referral organisation's staff (R7).
type ReferralController struct {
	ReferralUc domain.ReferralUsecaseI
}

func NewReferralController(uc domain.ReferralUsecaseI) *ReferralController {
	return &ReferralController{
		ReferralUc: uc,
	}
}

func (rc *ReferralController) ready(c *gin.Context) bool {
	if rc == nil || rc.ReferralUc == nil {
		notImplemented(c)
		return false
	}
	return true
}

// GET /api/v1/partner/referrals
// Referrals to the signed-in staff member's organisation, newest first.
func (rc *ReferralController) ListPartnerReferralsController(c *gin.Context) {
	if !rc.ready(c) {
		return
	}
	refs, err := rc.ReferralUc.ListPartnerReferrals(c.Request.Context(), infrastructure.ActorFrom(c))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, ListResponse[PartnerReferralDTO]{Items: toPartnerReferralDTOs(refs), NextCursor: nil})
}

// PATCH /api/v1/partner/referrals/:id
// Sets the status (in_progress | closed). Another organisation's referral is 404.
func (rc *ReferralController) UpdatePartnerReferralController(c *gin.Context) {
	if !rc.ready(c) {
		return
	}
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	var req UpdateReferralRequest
	if !bindJSON(c, &req) {
		return
	}
	ref, err := rc.ReferralUc.UpdatePartnerReferral(c.Request.Context(), infrastructure.ActorFrom(c), id, req.Status)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, toPartnerReferralDTO(ref))
}
