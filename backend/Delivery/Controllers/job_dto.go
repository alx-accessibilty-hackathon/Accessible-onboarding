package controllers

import (
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// ---- Requests ----

// GET /jobs?limit=20&cursor=…
type ListJobsQuery struct {
	Limit  int    `form:"limit" binding:"omitempty,min=1,max=100"`
	Cursor string `form:"cursor" binding:"omitempty,max=200"`
}

// POST /employer/jobs
type CreateJobRequest struct {
	Title          string   `json:"title" binding:"required,max=200"`
	Description    string   `json:"description" binding:"required,max=3000"`
	LocationType   string   `json:"location_type" binding:"required,oneof=onsite remote hybrid"`
	LocationText   string   `json:"location_text" binding:"omitempty,max=200"`
	WorkHours      string   `json:"work_hours" binding:"omitempty,max=200"`
	EmploymentType string   `json:"employment_type" binding:"required,oneof=full_time part_time contract internship temporary"`
	Accommodations []string `json:"accommodations" binding:"max=20,dive,required,max=64"` // codes from shared/vocab/needs.json
}

// ---- Responses ----

type EmployerRefDTO struct {
	Name string `json:"name"`
}

// One job in GET /jobs, GET /jobs/:id and GET /employer/jobs
type JobDTO struct {
	ID             uuid.UUID      `json:"id"`
	Title          string         `json:"title"`
	Description    string         `json:"description"`
	Employer       EmployerRefDTO `json:"employer"`
	LocationType   string         `json:"location_type"`
	LocationText   string         `json:"location_text"`
	WorkHours      string         `json:"work_hours"`
	EmploymentType string         `json:"employment_type"`
	Accommodations []string       `json:"accommodations"`
	Status         string         `json:"status"`
	PublishedAt    *time.Time     `json:"published_at"`
}

// 200 from POST /employer/jobs/:id/publish
type PublishJobResponse struct {
	ID        uuid.UUID `json:"id"`
	Status    string    `json:"status"`
	JSONLDURL string    `json:"jsonld_url"`
}

// ---- Mapping helpers ----

// toDomain builds a draft job; the use case sets EmployerID from the signed-in employer.
func (r CreateJobRequest) toDomain() *domain.Job {
	return &domain.Job{
		Source:         "local",
		Title:          r.Title,
		Description:    r.Description,
		LocationType:   r.LocationType,
		LocationText:   r.LocationText,
		WorkHours:      r.WorkHours,
		EmploymentType: r.EmploymentType,
		Accommodations: r.Accommodations,
		Status:         domain.JobStatusDraft,
	}
}

func toJobDTO(j *domain.Job, employerName string) JobDTO {
	accommodations := j.Accommodations
	if accommodations == nil {
		accommodations = []string{} // [] in JSON, never null
	}
	return JobDTO{
		ID:             j.ID,
		Title:          j.Title,
		Description:    j.Description,
		Employer:       EmployerRefDTO{Name: employerName},
		LocationType:   j.LocationType,
		LocationText:   j.LocationText,
		WorkHours:      j.WorkHours,
		EmploymentType: j.EmploymentType,
		Accommodations: accommodations,
		Status:         j.Status,
		PublishedAt:    j.PublishedAt,
	}
}
