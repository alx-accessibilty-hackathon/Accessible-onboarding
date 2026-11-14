package controllers

import (
	domain "bridge/Domain"

	"github.com/gin-gonic/gin"
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
func (lc *LearnerController) GetPartnerLearnerController(c *gin.Context) { notImplemented(c) }
