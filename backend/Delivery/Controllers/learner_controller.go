package controllers

import (
	"net/http"

	domain "bridge/Domain"
	infrastructure "bridge/Infrastructure"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type LearnerController struct {
	LearnerUc domain.LearnerUsecaseI
}

func NewLearnerController(uc domain.LearnerUsecaseI) *LearnerController {
	return &LearnerController{
		LearnerUc: uc,
	}
}

// partnerOf returns the calling partner server's ID, or nil if the caller isn't one.
func partnerOf(c *gin.Context) *uuid.UUID {
	actor := infrastructure.ActorFrom(c)
	if actor.Kind != domain.ActorPartnerServer || actor.PartnerID == uuid.Nil {
		return nil
	}
	return &actor.PartnerID
}

// GET /api/v1/partner-api/learners?updated_since=…&limit=…
func (lc *LearnerController) ListPartnerLearnersController(c *gin.Context) {
	if lc.LearnerUc == nil {
		notImplemented(c)
		return
	}
	var q ListPartnerLearnersQuery
	if !bindQuery(c, &q) {
		return
	}
	learners, err := lc.LearnerUc.ListPartnerLearners(c.Request.Context(), partnerOf(c), q.UpdatedSince, q.Limit)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, ListResponse[LearnerDTO]{Items: toLearnerDTOs(learners), NextCursor: nil})
}

// GET /api/v1/partner-api/learners/:id
func (lc *LearnerController) GetPartnerLearnerController(c *gin.Context) {
	if lc.LearnerUc == nil {
		notImplemented(c)
		return
	}
	learnerID, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	learner, err := lc.LearnerUc.GetPartnerLearner(c.Request.Context(), partnerOf(c), learnerID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, toLearnerDTO(learner))
}
