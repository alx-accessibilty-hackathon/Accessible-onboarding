package controllers

import (
	"net/http"

	domain "bridge/Domain"
	infrastructure "bridge/Infrastructure"

	"github.com/gin-gonic/gin"
)

type ApplicationController struct {
	ApplicationUc domain.ApplicationUsecaseI
}

func NewApplicationController(uc domain.ApplicationUsecaseI) *ApplicationController {
	return &ApplicationController{
		ApplicationUc: uc,
	}
}

// POST /api/v1/jobs/:id/applications
// Applies for a published job. 409 already_exists if the learner already applied.
func (ac *ApplicationController) CreateApplicationController(c *gin.Context) {
	jobID, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	var req CreateApplicationRequest
	if !bindJSON(c, &req) {
		return
	}
	app, err := ac.ApplicationUc.Apply(c.Request.Context(), infrastructure.ActorFrom(c), req.toDomain(jobID))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, toApplicationDTO(app))
}
