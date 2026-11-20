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

// GET /api/v1/me/applications
// The learner's own applications (support passport): for each, the job, the employer and
// whether that employer may see the learner's support needs. Newest first.
func (ac *ApplicationController) ListMyApplicationsController(c *gin.Context) {
	if ac == nil || ac.ApplicationUc == nil {
		notImplemented(c)
		return
	}
	apps, err := ac.ApplicationUc.ListMine(c.Request.Context(), infrastructure.ActorFrom(c))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, ListResponse[MyApplicationDTO]{Items: toMyApplicationDTOs(apps), NextCursor: nil})
}

// PATCH /api/v1/me/applications/:id  {"share_support": true|false}
// One tap to share the support needs with this application's employer, or to stop sharing
// them. Another learner's application is 404.
func (ac *ApplicationController) UpdateMyApplicationController(c *gin.Context) {
	if ac == nil || ac.ApplicationUc == nil {
		notImplemented(c)
		return
	}
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	var req UpdateMyApplicationRequest
	if !bindJSON(c, &req) {
		return
	}
	app, err := ac.ApplicationUc.SetSupportSharing(c.Request.Context(), infrastructure.ActorFrom(c), id, *req.ShareSupport)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, toMyApplicationDTO(app))
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
