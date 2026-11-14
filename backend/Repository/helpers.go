package repository

import (
	"errors"

	domain "bridge/Domain"
	sqlc "bridge/Repository/sqlc"

	"github.com/jackc/pgx/v5/pgconn"
)

// Small helpers for mapping generated sqlc rows to domain entities.

// deref returns the value behind a pointer, or the zero value for nil
// (sqlc makes nullable columns pointers).
func deref[T any](p *T) T {
	var zero T
	if p == nil {
		return zero
	}
	return *p
}

// nilIfEmpty stores "" as NULL, so optional text columns stay empty instead of holding "".
func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// PostgreSQL error codes we turn into domain errors.
const (
	pgUniqueViolation     = "23505"
	pgForeignKeyViolation = "23503"
)

func hasPgCode(err error, code string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == code
}

// ---- row → domain ----

func toLearner(r sqlc.Learner) *domain.Learner {
	return &domain.Learner{
		ID:            r.ID,
		PartnerID:     r.PartnerID,
		Status:        r.Status,
		FullName:      deref(r.FullName),
		PreferredName: deref(r.PreferredName),
		ContactMethod: deref(r.ContactMethod),
		PhoneE164:     deref(r.PhoneE164),
		PhoneVerified: r.PhoneVerified,
		DOB:           r.Dob,
		DOBCalendar:   deref(r.DobCalendar),
		Language:      r.Language,
		SimpleMode:    r.SimpleMode,
		IdentityLevel: r.IdentityLevel,
		CreatedAt:     r.CreatedAt,
		UpdatedAt:     r.UpdatedAt,
		RegisteredAt:  r.RegisteredAt,
	}
}

func toRegistration(r sqlc.Registration) *domain.Registration {
	return &domain.Registration{
		ID:            r.ID,
		LearnerID:     r.LearnerID,
		FlowID:        r.FlowID,
		FlowVersion:   int(r.FlowVersion),
		Status:        r.Status,
		CurrentStep:   deref(r.CurrentStep),
		ActingStaffID: r.ActingStaffID,
		CreatedAt:     r.CreatedAt,
		UpdatedAt:     r.UpdatedAt,
		SubmittedAt:   r.SubmittedAt,
	}
}

func toAnswer(r sqlc.Answer) *domain.Answer {
	return &domain.Answer{
		RegistrationID: r.RegistrationID,
		QuestionID:     r.QuestionID,
		Value:          r.Value,
		InputMethod:    r.InputMethod,
		Version:        int(r.Version),
		UpdatedAt:      r.UpdatedAt,
	}
}

func toIdentityEvidence(r sqlc.IdentityEvidence) *domain.IdentityEvidence {
	return &domain.IdentityEvidence{
		ID:         r.ID,
		LearnerID:  r.LearnerID,
		Route:      r.Route,
		DocType:    deref(r.DocType),
		Last4:      deref(r.Last4),
		Level:      r.Level,
		AttestedBy: r.AttestedBy,
		AttestedAt: r.AttestedAt,
		CreatedAt:  r.CreatedAt,
	}
}

func toReferral(r sqlc.Referral) *domain.Referral {
	return &domain.Referral{
		ID:                r.ID,
		LearnerID:         r.LearnerID,
		PartnerID:         r.PartnerID,
		ContactPreference: r.ContactPreference,
		Status:            r.Status,
		CreatedAt:         r.CreatedAt,
		UpdatedAt:         r.UpdatedAt,
	}
}

// toJob maps the job queries that join the employer name. ListPublishedJobsRow and
// ListJobsByEmployerRow have the same fields, so they convert to this type:
// toJob(sqlc.GetPublishedJobRow(row)).
func toJob(r sqlc.GetPublishedJobRow) *domain.Job {
	j := toJobWithoutEmployer(sqlc.CreateJobRow{
		ID: r.ID, EmployerID: r.EmployerID, Source: r.Source, Title: r.Title, Description: r.Description,
		LocationType: r.LocationType, LocationText: r.LocationText, WorkHours: r.WorkHours,
		EmploymentType: r.EmploymentType, Accommodations: r.Accommodations, Status: r.Status,
		CreatedAt: r.CreatedAt, PublishedAt: r.PublishedAt,
	})
	j.EmployerName = r.EmployerName
	return j
}

// toJobWithoutEmployer maps CreateJob and PublishJob rows (PublishJobRow converts to CreateJobRow).
func toJobWithoutEmployer(r sqlc.CreateJobRow) *domain.Job {
	return &domain.Job{
		ID:             r.ID,
		EmployerID:     r.EmployerID,
		Source:         r.Source,
		Title:          r.Title,
		Description:    r.Description,
		LocationType:   r.LocationType,
		LocationText:   deref(r.LocationText),
		WorkHours:      deref(r.WorkHours),
		EmploymentType: r.EmploymentType,
		Accommodations: r.Accommodations,
		Status:         r.Status,
		CreatedAt:      r.CreatedAt,
		PublishedAt:    r.PublishedAt,
	}
}

func toApplication(r sqlc.Application) *domain.Application {
	return &domain.Application{
		ID:            r.ID,
		JobID:         r.JobID,
		LearnerID:     r.LearnerID,
		Answers:       r.Answers,
		AttachSupport: r.AttachSupport,
		Status:        r.Status,
		CreatedAt:     r.CreatedAt,
	}
}
