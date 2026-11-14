package usecase

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type appFixture struct {
	uc        *ApplicationUsecase
	store     *memStore
	learner   domain.Actor
	published uuid.UUID
	draft     uuid.UUID
}

func newAppFixture(t *testing.T, learnerStatus string) appFixture {
	t.Helper()
	s := newMemStore()
	learnerID := uuid.New()
	s.learners[learnerID] = &domain.Learner{ID: learnerID, Status: learnerStatus}

	now := time.Now().UTC()
	published, draft := uuid.New(), uuid.New()
	s.jobs[published] = &domain.Job{ID: published, Status: domain.JobStatusPublished, PublishedAt: &now}
	s.jobs[draft] = &domain.Job{ID: draft, Status: domain.JobStatusDraft}

	return appFixture{
		uc:        NewApplicationUsecase(fakeApplications{s}, fakeJobs{s}, fakeLearners{s}),
		store:     s,
		learner:   domain.Actor{Kind: domain.ActorLearner, ID: learnerID},
		published: published,
		draft:     draft,
	}
}

var someAnswers = json.RawMessage(`{"contact_confirm":{"value":"yes","input_method":"choice"},"motivation":{"value":"I like numbers.","input_method":"voice"}}`)

func TestApplyOncePerJob(t *testing.T) {
	f := newAppFixture(t, domain.LearnerStatusRegistered)
	ctx := context.Background()

	app, err := f.uc.Apply(ctx, f.learner, &domain.Application{JobID: f.published, Answers: someAnswers, AttachSupport: true})
	require.NoError(t, err)
	assert.Equal(t, domain.ApplicationStatusSubmitted, app.Status)
	assert.Equal(t, f.learner.ID, app.LearnerID)
	assert.True(t, app.AttachSupport)

	_, err = f.uc.Apply(ctx, f.learner, &domain.Application{JobID: f.published, Answers: someAnswers})
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
}

func TestApplyNeedsARegisteredLearner(t *testing.T) {
	f := newAppFixture(t, domain.LearnerStatusDraft)
	_, err := f.uc.Apply(context.Background(), f.learner, &domain.Application{JobID: f.published, Answers: someAnswers})
	assert.ErrorIs(t, err, domain.ErrForbidden)

	_, err = f.uc.Apply(context.Background(), domain.Actor{Kind: domain.ActorAnonymous}, &domain.Application{JobID: f.published, Answers: someAnswers})
	assert.ErrorIs(t, err, domain.ErrUnauthorized)

	employer := employerActor(employerA)
	_, err = f.uc.Apply(context.Background(), employer, &domain.Application{JobID: f.published, Answers: someAnswers})
	assert.ErrorIs(t, err, domain.ErrForbidden)
}

func TestApplyToDraftOrMissingJobIsNotFound(t *testing.T) {
	f := newAppFixture(t, domain.LearnerStatusRegistered)
	for _, id := range []uuid.UUID{f.draft, uuid.New()} {
		_, err := f.uc.Apply(context.Background(), f.learner, &domain.Application{JobID: id, Answers: someAnswers})
		assert.ErrorIs(t, err, domain.ErrNotFound)
	}
	assert.Empty(t, f.store.apps)
}

func TestApplyAnswersMustBeAnObject(t *testing.T) {
	f := newAppFixture(t, domain.LearnerStatusRegistered)
	for _, answers := range []string{`[]`, `"text"`, `null`, `{bad json`} {
		_, err := f.uc.Apply(context.Background(), f.learner, &domain.Application{JobID: f.published, Answers: json.RawMessage(answers)})
		assert.Equal(t, map[string]string{"answers": "invalid"}, fieldCodes(t, err), answers)
	}
}
