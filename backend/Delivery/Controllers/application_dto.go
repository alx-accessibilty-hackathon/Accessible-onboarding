package controllers

import (
	"encoding/json"
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// POST /jobs/:id/applications
type CreateApplicationRequest struct {
	Answers              json.RawMessage `json:"answers" binding:"required"` // answers keyed by step id, as in the job-application flow
	AttachSupportRequest bool            `json:"attach_support_request"`
}

// 201 from POST /jobs/:id/applications
type ApplicationDTO struct {
	ID        uuid.UUID `json:"id"`
	JobID     uuid.UUID `json:"job_id"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

// toDomain builds the application; the use case sets LearnerID from the signed-in learner.
func (r CreateApplicationRequest) toDomain(jobID uuid.UUID) *domain.Application {
	return &domain.Application{JobID: jobID, Answers: r.Answers, AttachSupport: r.AttachSupportRequest}
}

func toApplicationDTO(a *domain.Application) ApplicationDTO {
	return ApplicationDTO{ID: a.ID, JobID: a.JobID, Status: a.Status, CreatedAt: a.CreatedAt}
}
