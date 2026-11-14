package repository_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	domain "bridge/Domain"
	repository "bridge/Repository"
	"bridge/Repository/repotest"
	sqlc "bridge/Repository/sqlc"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// These tests run the real SQL against PostgreSQL. They are skipped unless
// TEST_DATABASE_URL is set (see repotest.NewDB).

type seeded struct {
	platform, referral, employerA, employerB uuid.UUID
}

func seed(t *testing.T, db *pgxpool.Pool) seeded {
	t.Helper()
	ctx := context.Background()
	var s seeded
	require.NoError(t, db.QueryRow(ctx, `INSERT INTO partners (slug, name, kind, publishable_key) VALUES ('savanna', 'Savanna (demo)', 'platform', 'pk_test_savanna') RETURNING id`).Scan(&s.platform))
	require.NoError(t, db.QueryRow(ctx, `INSERT INTO partners (slug, name, kind, publishable_key) VALUES ('aaapd', 'AAAPD', 'referral_org', 'pk_test_aaapd') RETURNING id`).Scan(&s.referral))
	require.NoError(t, db.QueryRow(ctx, `INSERT INTO employers (name) VALUES ('Example Co') RETURNING id`).Scan(&s.employerA))
	require.NoError(t, db.QueryRow(ctx, `INSERT INTO employers (name) VALUES ('Other Co') RETURNING id`).Scan(&s.employerB))
	return s
}

func startRegistration(t *testing.T, regs *repository.RegistrationRepository, partnerID uuid.UUID) (*domain.Learner, *domain.Registration) {
	t.Helper()
	l, r, err := regs.Start(context.Background(),
		&domain.Learner{PartnerID: partnerID, Language: "am", SimpleMode: true},
		&domain.Registration{FlowID: "signup", FlowVersion: 1, CurrentStep: "welcome"})
	require.NoError(t, err)
	return l, r
}

func TestRegistrationRepository(t *testing.T) {
	db := repotest.NewDB(t)
	s := seed(t, db)
	ctx := context.Background()
	regs := repository.NewRegistrationRepo(db)
	learners := repository.NewLearnerRepo(db)

	learner, reg := startRegistration(t, regs, s.platform)
	assert.Equal(t, domain.LearnerStatusDraft, learner.Status)
	assert.Equal(t, domain.IdentitySelfDeclared, learner.IdentityLevel)
	assert.Equal(t, learner.ID, reg.LearnerID)
	assert.Equal(t, domain.RegistrationStatusDraft, reg.Status)

	got, err := regs.GetRegistrationByID(ctx, reg.ID)
	require.NoError(t, err)
	assert.Equal(t, "welcome", got.CurrentStep)
	_, err = regs.GetRegistrationByID(ctx, uuid.New())
	assert.ErrorIs(t, err, domain.ErrNotFound)

	require.NoError(t, regs.UpdateProgress(ctx, reg.ID, "full_name"))
	assert.ErrorIs(t, regs.UpdateProgress(ctx, uuid.New(), "full_name"), domain.ErrNotFound)
	lang := "en"
	require.NoError(t, learners.UpdatePreferences(ctx, learner.ID, &lang, nil))
	l, err := learners.GetByID(ctx, learner.ID)
	require.NoError(t, err)
	assert.Equal(t, "en", l.Language)
	assert.True(t, l.SimpleMode, "unchanged when not sent")

	// The version rule (R15).
	answer := func(v string) *domain.Answer {
		return &domain.Answer{RegistrationID: reg.ID, QuestionID: "full_name", Value: json.RawMessage(v), InputMethod: "typed"}
	}
	a1, err := regs.SaveAnswerIfVersion(ctx, answer(`"Abebe Kebede"`), 0)
	require.NoError(t, err)
	assert.Equal(t, 1, a1.Version)
	_, err = regs.SaveAnswerIfVersion(ctx, answer(`"Stale"`), 0)
	var conflict *domain.ConflictError
	require.True(t, errors.As(err, &conflict), "got %v", err)
	assert.Equal(t, 1, conflict.Current.Version)
	assert.JSONEq(t, `"Abebe Kebede"`, string(conflict.Current.Value))
	a2, err := regs.SaveAnswerIfVersion(ctx, answer(`"Abebe K."`), 1)
	require.NoError(t, err)
	assert.Equal(t, 2, a2.Version)

	list, err := regs.ListAnswersByRegistrationID(ctx, reg.ID)
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.JSONEq(t, `"Abebe K."`, string(list[0].Value))

	// Submit, with a referral.
	dob := time.Date(2017, 9, 25, 0, 0, 0, 0, time.UTC)
	profile := &domain.Learner{ID: learner.ID, FullName: "Abebe K.", ContactMethod: "none", DOB: &dob, DOBCalendar: "ethiopian"}
	res, err := regs.SubmitTx(ctx, reg.ID, profile,
		&domain.IdentityEvidence{Route: "none", Level: domain.IdentitySelfDeclared},
		&domain.Referral{PartnerID: s.referral, ContactPreference: "in_person"})
	require.NoError(t, err)
	assert.Equal(t, domain.LearnerStatusRegistered, res.Learner.Status)
	assert.NotNil(t, res.Learner.RegisteredAt)
	assert.Equal(t, "2017-09-25", res.Learner.DOB.Format("2006-01-02"))
	assert.Empty(t, res.Learner.PhoneE164)
	assert.Equal(t, "none", res.Evidence.Route)
	require.NotNil(t, res.Referral)
	assert.Equal(t, domain.ReferralStatusRequested, res.Referral.Status)

	after, err := regs.GetRegistrationByID(ctx, reg.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.RegistrationStatusSubmitted, after.Status)
	assert.NotNil(t, after.SubmittedAt)

	_, err = regs.SubmitTx(ctx, reg.ID, profile, &domain.IdentityEvidence{Route: "none", Level: domain.IdentitySelfDeclared}, nil)
	assert.ErrorIs(t, err, domain.ErrAlreadySubmitted)

	ref, err := learners.GetLatestReferral(ctx, learner.ID)
	require.NoError(t, err)
	assert.Equal(t, res.Referral.ID, ref.ID)
}

func TestSubmitTxIsAllOrNothing(t *testing.T) {
	db := repotest.NewDB(t)
	s := seed(t, db)
	ctx := context.Background()
	regs := repository.NewRegistrationRepo(db)
	learner, reg := startRegistration(t, regs, s.platform)

	// An unknown referral partner fails the last insert: nothing before it may stay.
	_, err := regs.SubmitTx(ctx, reg.ID, &domain.Learner{ID: learner.ID, FullName: "Abebe"},
		&domain.IdentityEvidence{Route: "none", Level: domain.IdentitySelfDeclared},
		&domain.Referral{PartnerID: uuid.New(), ContactPreference: "phone"})
	var verr *domain.ValidationError
	require.True(t, errors.As(err, &verr), "got %v", err)

	after, err := regs.GetRegistrationByID(ctx, reg.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.RegistrationStatusDraft, after.Status, "rolled back")
	var evidence int
	require.NoError(t, db.QueryRow(ctx, `SELECT count(*) FROM identity_evidence`).Scan(&evidence))
	assert.Zero(t, evidence)
	l, err := repository.NewLearnerRepo(db).GetByID(ctx, learner.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.LearnerStatusDraft, l.Status)
	assert.Empty(t, l.FullName)
}

func TestSupportRepository(t *testing.T) {
	db := repotest.NewDB(t)
	s := seed(t, db)
	ctx := context.Background()
	learner, _ := startRegistration(t, repository.NewRegistrationRepo(db), s.platform)
	support := repository.NewSupportRepo(db)

	exists, err := support.Exists(ctx, learner.ID)
	require.NoError(t, err)
	assert.False(t, exists)

	first, err := support.Upsert(ctx, learner.ID, []byte("nonce-1"), []byte("cipher-1"), true, false)
	require.NoError(t, err)
	second, err := support.Upsert(ctx, learner.ID, []byte("nonce-2"), []byte("cipher-2"), false, true)
	require.NoError(t, err)
	assert.False(t, second.Before(first))

	row, err := sqlc.New(db).GetSupportRequestByLearner(ctx, learner.ID)
	require.NoError(t, err)
	assert.Equal(t, []byte("cipher-2"), row.Ciphertext, "replaced, one row per learner")
	assert.True(t, row.ShareEmployers)
	exists, err = support.Exists(ctx, learner.ID)
	require.NoError(t, err)
	assert.True(t, exists)
}

func TestJobRepository(t *testing.T) {
	db := repotest.NewDB(t)
	s := seed(t, db)
	ctx := context.Background()
	jobs := repository.NewJobRepo(db)

	require.NoError(t, repository.SeedJobs(ctx, sqlc.New(db), s.employerA))

	all, err := jobs.ListPublished(ctx, 100, nil)
	require.NoError(t, err)
	require.Len(t, all, 6)
	assert.Equal(t, "Example Co", all[0].EmployerName)
	for _, j := range all {
		assert.Equal(t, domain.JobStatusPublished, j.Status)
		assert.NotNil(t, j.PublishedAt)
		assert.NotEmpty(t, j.Accommodations)
	}

	// Pages: 4, then the remaining 2, with no job twice.
	page1, err := jobs.ListPublished(ctx, 4, nil)
	require.NoError(t, err)
	require.Len(t, page1, 4)
	last := page1[3]
	page2, err := jobs.ListPublished(ctx, 4, &domain.JobCursor{PublishedAt: *last.PublishedAt, ID: last.ID})
	require.NoError(t, err)
	require.Len(t, page2, 2)
	seen := map[uuid.UUID]bool{}
	for _, j := range append(page1, page2...) {
		assert.False(t, seen[j.ID])
		seen[j.ID] = true
	}

	// A draft is private until its own employer publishes it.
	draft, err := jobs.Create(ctx, &domain.Job{EmployerID: &s.employerA, Source: "local", Title: "Draft", Description: "d",
		LocationType: "remote", EmploymentType: "part_time"})
	require.NoError(t, err)
	assert.Equal(t, domain.JobStatusDraft, draft.Status)
	assert.Equal(t, []string{}, draft.Accommodations)
	_, err = jobs.GetPublished(ctx, draft.ID)
	assert.ErrorIs(t, err, domain.ErrNotFound)

	_, err = jobs.Publish(ctx, draft.ID, s.employerB)
	assert.ErrorIs(t, err, domain.ErrNotFound, "another employer can't publish it")
	published, err := jobs.Publish(ctx, draft.ID, s.employerA)
	require.NoError(t, err)
	assert.Equal(t, domain.JobStatusPublished, published.Status)
	again, err := jobs.Publish(ctx, draft.ID, s.employerA)
	require.NoError(t, err)
	assert.True(t, again.PublishedAt.Equal(*published.PublishedAt), "publishing twice keeps the first date")

	public, err := jobs.GetPublished(ctx, draft.ID)
	require.NoError(t, err)
	assert.Equal(t, "Example Co", public.EmployerName)

	mine, err := jobs.ListByEmployer(ctx, s.employerA)
	require.NoError(t, err)
	assert.Len(t, mine, 7)
	theirs, err := jobs.ListByEmployer(ctx, s.employerB)
	require.NoError(t, err)
	assert.Empty(t, theirs)
}

func TestApplicationRepository(t *testing.T) {
	db := repotest.NewDB(t)
	s := seed(t, db)
	ctx := context.Background()
	learner, _ := startRegistration(t, repository.NewRegistrationRepo(db), s.platform)
	require.NoError(t, repository.SeedJobs(ctx, sqlc.New(db), s.employerA))
	jobs, err := repository.NewJobRepo(db).ListPublished(ctx, 1, nil)
	require.NoError(t, err)
	apps := repository.NewApplicationRepo(db)

	app := &domain.Application{JobID: jobs[0].ID, LearnerID: learner.ID, Answers: json.RawMessage(`{"motivation":{"value":"Hi"}}`), AttachSupport: true}
	created, err := apps.Create(ctx, app)
	require.NoError(t, err)
	assert.Equal(t, domain.ApplicationStatusSubmitted, created.Status)
	assert.True(t, created.AttachSupport)

	_, err = apps.Create(ctx, app)
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)

	_, err = apps.Create(ctx, &domain.Application{JobID: uuid.New(), LearnerID: learner.ID, Answers: json.RawMessage(`{}`)})
	assert.ErrorIs(t, err, domain.ErrNotFound)
}
