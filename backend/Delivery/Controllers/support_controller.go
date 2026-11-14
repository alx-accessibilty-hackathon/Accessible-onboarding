package controllers

import (
	"net/http"

	domain "bridge/Domain"
	infrastructure "bridge/Infrastructure"

	"github.com/gin-gonic/gin"
)

type SupportController struct {
	SupportUc domain.SupportUsecaseI
}

func NewSupportController(uc domain.SupportUsecaseI) *SupportController {
	return &SupportController{
		SupportUc: uc,
	}
}

// PUT /api/v1/registrations/:id/support-request
// Saves (replaces) the learner's support needs, encrypted. The answer never repeats them.
func (sc *SupportController) SaveSupportRequestController(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	var req SaveSupportRequestRequest
	if !bindJSON(c, &req) {
		return
	}
	updatedAt, err := sc.SupportUc.Save(c.Request.Context(), infrastructure.ActorFrom(c), id, req.toDomain())
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, SupportSavedResponse{Status: "saved", UpdatedAt: updatedAt})
}
