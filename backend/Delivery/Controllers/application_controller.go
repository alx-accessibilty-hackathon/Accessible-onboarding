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

// EmployerApplicationController: an employer reads the applications to their own jobs.
type EmployerApplicationController struct {
	EmployerApplicationUc domain.EmployerApplicationUsecaseI
}

func NewEmployerApplicationController(uc domain.EmployerApplicationUsecaseI) *EmployerApplicationController {
	return &EmployerApplicationController{
		EmployerApplicationUc: uc,
	}
}

// GET /api/v1/employer/jobs/:id/applications
// Applications to one of the employer's jobs, newest first; support needs only where the
// applicant attached them (each read is audit-logged). Another employer's job is 404.
func (ec *EmployerApplicationController) ListJobApplicationsController(c *gin.Context) {
	if ec == nil || ec.EmployerApplicationUc == nil {
		notImplemented(c)
		return
	}
	jobID, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	apps, err := ec.EmployerApplicationUc.ListJobApplications(c.Request.Context(), infrastructure.ActorFrom(c), jobID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, ListResponse[EmployerApplicationDTO]{Items: toEmployerApplicationDTOs(apps), NextCursor: nil})
}
