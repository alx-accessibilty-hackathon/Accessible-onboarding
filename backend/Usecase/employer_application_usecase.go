package usecase

import (
	"context"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// EmployerApplicationUsecase: an employer reads the applications to their own jobs (C3, Q7).
// An applicant's support needs are shown only when they attached them to that application,
// and every time they are decrypted an audit_log row records who read them.
type EmployerApplicationUsecase struct {
	JobRepo         domain.JobRepositoryI // to check the job is the employer's
	ApplicationRepo domain.EmployerApplicationRepositoryI
	AuditRepo       domain.AuditRepositoryI
	Security        domain.SecurityService
}

var _ domain.EmployerApplicationUsecaseI = (*EmployerApplicationUsecase)(nil)

func NewEmployerApplicationUsecase(jrp domain.JobRepositoryI, arp domain.EmployerApplicationRepositoryI, audit domain.AuditRepositoryI, sec domain.SecurityService) *EmployerApplicationUsecase {
	return &EmployerApplicationUsecase{
		JobRepo:         jrp,
		ApplicationRepo: arp,
		AuditRepo:       audit,
		Security:        sec,
	}
}

// ListJobApplications returns the applications to one of the employer's jobs, newest first.
// Another employer's job looks like it doesn't exist (404).
func (uc *EmployerApplicationUsecase) ListJobApplications(ctx context.Context, actor domain.Actor, jobID uuid.UUID) ([]*domain.EmployerApplication, error) {
	employerID, err := employerOf(actor)
	if err != nil {
		return nil, err
	}
	jobs, err := uc.JobRepo.ListByEmployer(ctx, employerID)
	if err != nil {
		return nil, err
	}
	owned := false
	for _, j := range jobs {
		if j.ID == jobID {
			owned = true
			break
		}
	}
	if !owned {
		return nil, domain.ErrNotFound
	}

	apps, err := uc.ApplicationRepo.ListForEmployerJob(ctx, jobID, employerID)
	if err != nil {
		return nil, err
	}
	for _, a := range apps {
		sealed := a.Sealed
		a.Sealed = nil // never leaves the use case
		if sealed == nil || !a.Application.AttachSupport {
			continue
		}
		support, err := openSupportRequest(uc.Security, sealed)
		if err != nil {
			return nil, err
		}
		// No audit row, no support needs.
		learnerID := a.Application.LearnerID
		if err := uc.AuditRepo.Log(ctx, &domain.AuditEntry{
			ActorType:  domain.AuditActorStaff,
			ActorID:    &actor.ID,
			Action:     domain.AuditActionSupportRead,
			TargetType: domain.AuditTargetLearner,
			TargetID:   &learnerID,
			Meta:       map[string]any{"job_id": jobID.String()},
		}); err != nil {
			return nil, err
		}
		a.Support = support
	}
	return apps, nil
}
