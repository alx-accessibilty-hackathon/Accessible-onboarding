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

// One item of GET /employer/jobs/:id/applications
type EmployerApplicationDTO struct {
	ID            uuid.UUID              `json:"id"`
	Status        string                 `json:"status"`
	CreatedAt     time.Time              `json:"created_at"`
	Answers       json.RawMessage        `json:"answers"` // { "<step>": { "value": …, "input_method": "…" } }
	AttachSupport bool                   `json:"attach_support"`
	Applicant     ApplicantDTO           `json:"applicant"`
	Support       *ApplicationSupportDTO `json:"support"` // only when the applicant attached it
}

type ApplicantDTO struct {
	FullName      string `json:"full_name"`
	PreferredName string `json:"preferred_name"`
	ContactMethod string `json:"contact_method"`
	Phone         string `json:"phone"`
	Language      string `json:"language"`
}

type ApplicationSupportDTO struct {
	Needs     []string `json:"needs"`
	OtherText string   `json:"other_text"`
}

func toEmployerApplicationDTOs(apps []*domain.EmployerApplication) []EmployerApplicationDTO {
	out := make([]EmployerApplicationDTO, 0, len(apps)) // [] in JSON, never null
	for _, a := range apps {
		answers := a.Application.Answers
		if len(answers) == 0 {
			answers = json.RawMessage(`{}`)
		}
		dto := EmployerApplicationDTO{
			ID:            a.Application.ID,
			Status:        a.Application.Status,
			CreatedAt:     a.Application.CreatedAt,
			Answers:       answers,
			AttachSupport: a.Application.AttachSupport,
			Applicant: ApplicantDTO{
				FullName:      a.Applicant.FullName,
				PreferredName: a.Applicant.PreferredName,
				ContactMethod: a.Applicant.ContactMethod,
				Phone:         a.Applicant.PhoneE164,
				Language:      a.Applicant.Language,
			},
		}
		if a.Support != nil {
			needs := a.Support.Needs
			if needs == nil {
				needs = []string{}
			}
			dto.Support = &ApplicationSupportDTO{Needs: needs, OtherText: a.Support.OtherText}
		}
		out = append(out, dto)
	}
	return out
}
