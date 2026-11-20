package usecase

import (
	"context"
	"encoding/json"
	"errors"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// ApplicationUsecase submits job applications (optionally with the support request attached) (C1).
type ApplicationUsecase struct {
	ApplicationRepo domain.ApplicationRepositoryI
	JobRepo         domain.JobRepositoryI
	LearnerRepo     domain.LearnerRepositoryI

	// Optional (set in main.go only when real SMS is on): the "application sent" SMS
	// (notify.go). Nil: no SMS.
	Outbox   domain.SessionRepositoryI
	Messages domain.MessageService
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

	learner, err := uc.LearnerRepo.GetByID(ctx, learnerID)
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

	created, err := uc.ApplicationRepo.Create(ctx, &domain.Application{
		JobID:         job.ID,
		LearnerID:     learner.ID,
		Answers:       app.Answers,
		AttachSupport: app.AttachSupport,
	})
	if err != nil {
		return nil, err
	}
	// "Your application was sent" by SMS, if the learner chose to be contacted by phone.
	if phone, ok := smsPhone(learner.ContactMethod, learner.PhoneE164); ok && uc.Messages != nil {
		var outbox outboxWriter
		if uc.Outbox != nil {
			outbox = uc.Outbox
		}
		queueSMS(ctx, outbox, uc.Messages, phone, applicationSMS(learner.Language, job.Title, job.EmployerName))
	}
	return created, nil
}

// ListMine: the support passport. The learner's applications and, for each employer, whether
// it may see their support needs. Only the learner's own token (not partner staff).
func (uc *ApplicationUsecase) ListMine(ctx context.Context, actor domain.Actor) ([]*domain.LearnerApplication, error) {
	id, err := meLearnerID(actor)
	if err != nil {
		return nil, err
	}
	return uc.ApplicationRepo.ListForLearner(ctx, id)
}

// SetSupportSharing: one tap to share the support needs with this application's employer, or
// to stop sharing them. It takes effect at once: the employer's list joins the support request
// only while it is shared (ListApplicationsForEmployerJob).
func (uc *ApplicationUsecase) SetSupportSharing(ctx context.Context, actor domain.Actor, applicationID uuid.UUID, share bool) (*domain.LearnerApplication, error) {
	id, err := meLearnerID(actor)
	if err != nil {
		return nil, err
	}
	if err := uc.ApplicationRepo.SetSupportSharing(ctx, id, applicationID, share); err != nil {
		return nil, err
	}
	apps, err := uc.ApplicationRepo.ListForLearner(ctx, id)
	if err != nil {
		return nil, err
	}
	for _, a := range apps {
		if a.ID == applicationID {
			return a, nil
		}
	}
	return nil, domain.ErrNotFound
}
