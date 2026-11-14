package controllers

import (
	"errors"
	"net/http"

	domain "bridge/Domain"

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

// GET /api/v1/partner-api/learners
func (lc *LearnerController) ListPartnerLearnersController(c *gin.Context) { notImplemented(c) }

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

	var partnerID *uuid.UUID
	if actorVal, exists := c.Get("actor"); exists {
		if actor, ok := actorVal.(*domain.Actor); ok && actor.PartnerID != uuid.Nil {
			partnerID = &actor.PartnerID
		}
	}

	learner, err := lc.LearnerUc.GetPartnerLearner(c.Request.Context(), partnerID, learnerID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			c.AbortWithStatusJSON(http.StatusNotFound, ErrorResponse{
				Status: http.StatusNotFound,
				Code:   "not_found",
				Title:  "Learner not found",
			})
			return
		}

		c.AbortWithStatusJSON(http.StatusInternalServerError, ErrorResponse{
			Status: http.StatusInternalServerError,
			Code:   "internal_error",
			Title:  "Failed to get learner",
		})
		return
	}

	c.JSON(http.StatusOK, toLearnerDTO(learner))
}
