package usecase

import (
	"context"
	"encoding/json"
	"errors"

	domain "bridge/Domain"
)

// ApplicationUsecase submits job applications (optionally with the support request attached) (C1).
type ApplicationUsecase struct {
	ApplicationRepo domain.ApplicationRepositoryI
	JobRepo         domain.JobRepositoryI
	LearnerRepo     domain.LearnerRepositoryI
}

var _ domain.ApplicationUsecaseI = (*ApplicationUsecase)(nil)

func NewApplicationUsecase(arp domain.ApplicationRepositoryI, jrp domain.JobRepositoryI, lrp domain.LearnerRepositoryI) *ApplicationUsecase {
	return &ApplicationUsecase{
		ApplicationRepo: arp,
		JobRepo:         jrp,
		LearnerRepo:     lrp,
	}
}

const maxApplicationAnswersBytes = 32 * 1024

// Apply sends an application for a published job. Only a learner who finished signing up
// can apply, and only once per job (409 the second time). attach_support only records the
// learner's choice; employers see support needs only when it is true (Should, C3).
func (uc *ApplicationUsecase) Apply(ctx context.Context, actor domain.Actor, app *domain.Application) (*domain.Application, error) {
	if actor.IsAnonymous() {
		return nil, domain.ErrUnauthorized
	}
	learnerID := actor.ID
	if actor.Kind == domain.ActorStaff && actor.ActingFor != nil { // partner staff helping a learner (E1)
		learnerID = *actor.ActingFor
	} else if actor.Kind != domain.ActorLearner {
		return nil, domain.ErrForbidden
	}

	learner, err := uc.LearnerRepo.Get(ctx, learnerID)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, domain.ErrForbidden
	}
	if err != nil {
		return nil, err
	}
	if learner.Status != domain.LearnerStatusRegistered {
		return nil, domain.ErrForbidden // finish signing up first
	}

	job, err := uc.JobRepo.GetPublished(ctx, app.JobID) // drafts and closed jobs are 404
	if err != nil {
		return nil, err
	}

	// The answers are the job-application flow's answers, keyed by step ID.
	if len(app.Answers) > maxApplicationAnswersBytes {
		return nil, domain.NewValidationError("answers", codeTooLong)
	}
	var answers map[string]json.RawMessage
	if err := json.Unmarshal(app.Answers, &answers); err != nil || answers == nil {
		return nil, domain.NewValidationError("answers", codeInvalid)
	}

	return uc.ApplicationRepo.Create(ctx, &domain.Application{
		JobID:         job.ID,
		LearnerID:     learner.ID,
		Answers:       app.Answers,
		AttachSupport: app.AttachSupport,
	})
}
