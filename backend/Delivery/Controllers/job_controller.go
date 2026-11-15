package controllers

import (
	"encoding/json"
	"net/http"

	domain "bridge/Domain"
	infrastructure "bridge/Infrastructure"

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

// GET /api/v1/jobs?limit=20&cursor=…
// Published jobs, newest first, with their accommodation codes. The widget filters them
// against the learner's needs in the browser.
func (jc *JobController) ListJobsController(c *gin.Context) {
	var q ListJobsQuery
	if !bindQuery(c, &q) {
		return
	}
	jobs, next, err := jc.JobUc.ListJobs(c.Request.Context(), q.Limit, q.Cursor)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, ListResponse[JobDTO]{Items: toJobDTOs(jobs), NextCursor: next})
}

// GET /api/v1/jobs/:id
func (jc *JobController) GetJobController(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	job, err := jc.JobUc.GetJob(c.Request.Context(), id)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, toJobDTO(job, job.EmployerName))
}

// GET /api/v1/jobs/:id/jobposting.jsonld
// The job as schema.org JobPosting JSON-LD, for job boards and search engines.
func (jc *JobController) GetJobPostingController(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	posting, err := jc.JobUc.GetJobPosting(c.Request.Context(), id)
	if err != nil {
		respondError(c, err)
		return
	}
	body, err := json.Marshal(posting)
	if err != nil {
		respondError(c, err)
		return
	}
	c.Data(http.StatusOK, "application/ld+json; charset=utf-8", body)
}

// GET /api/v1/employer/jobs
// The signed-in employer's own jobs, drafts included.
func (jc *JobController) ListEmployerJobsController(c *gin.Context) {
	jobs, err := jc.JobUc.ListEmployerJobs(c.Request.Context(), infrastructure.ActorFrom(c))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, ListResponse[JobDTO]{Items: toJobDTOs(jobs), NextCursor: nil})
}

// POST /api/v1/employer/jobs
// Saves a draft job. It becomes public only when published.
func (jc *JobController) CreateEmployerJobController(c *gin.Context) {
	var req CreateJobRequest
	if !bindJSON(c, &req) {
		return
	}
	job, err := jc.JobUc.CreateEmployerJob(c.Request.Context(), infrastructure.ActorFrom(c), req.toDomain())
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, toJobDTO(job, job.EmployerName))
}

// POST /api/v1/employer/jobs/:id/publish
// Makes the job public and returns the address of its JobPosting JSON-LD.
func (jc *JobController) PublishEmployerJobController(c *gin.Context) {
	id, ok := uuidParam(c, "id")
	if !ok {
		return
	}
	job, jsonldURL, err := jc.JobUc.PublishEmployerJob(c.Request.Context(), infrastructure.ActorFrom(c), id)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, PublishJobResponse{ID: job.ID, Status: job.Status, JSONLDURL: jsonldURL})
}
