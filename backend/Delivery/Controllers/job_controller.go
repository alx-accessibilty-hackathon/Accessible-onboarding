package controllers

import (
	domain "bridge/Domain"

	"github.com/gin-gonic/gin"
)

type JobController struct {
	JobUc domain.JobUsecaseI
}

func NewJobController(uc domain.JobUsecaseI) *JobController {
	return &JobController{
		JobUc: uc,
	}
}

// GET /api/v1/jobs
func (jc *JobController) ListJobsController(c *gin.Context) { notImplemented(c) }

// GET /api/v1/jobs/:id
func (jc *JobController) GetJobController(c *gin.Context) { notImplemented(c) }

// GET /api/v1/jobs/:id/jobposting.jsonld
func (jc *JobController) GetJobPostingController(c *gin.Context) { notImplemented(c) }

// GET /api/v1/employer/jobs
func (jc *JobController) ListEmployerJobsController(c *gin.Context) { notImplemented(c) }

// POST /api/v1/employer/jobs
func (jc *JobController) CreateEmployerJobController(c *gin.Context) { notImplemented(c) }

// POST /api/v1/employer/jobs/:id/publish
func (jc *JobController) PublishEmployerJobController(c *gin.Context) { notImplemented(c) }
