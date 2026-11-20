package usecase

import (
	"context"
	"sort"
	"sync"
	"testing"
	"time"

	domain "bridge/Domain"
	infrastructure "bridge/Infrastructure"

	"github.com/google/uuid"
)

// In-memory fakes of the repositories, so use cases are tested without a database.
// They follow the same rules as the SQL (version check, one application per job, …).

type memStore struct {
	mu        sync.Mutex
	learners  map[uuid.UUID]*domain.Learner
	regs      map[uuid.UUID]*domain.Registration
	answers   map[uuid.UUID]map[string]*domain.Answer
	evidence  []*domain.IdentityEvidence
	referrals []*domain.Referral
	support   map[uuid.UUID]supportRow
	jobs      map[uuid.UUID]*domain.Job
	apps      map[[2]uuid.UUID]*domain.Application
}

type supportRow struct {
	nonce, ciphertext            []byte
	shareCourses, shareEmployers bool
	updatedAt                    time.Time
}

func newMemStore() *memStore {
	return &memStore{
		learners: map[uuid.UUID]*domain.Learner{},
		regs:     map[uuid.UUID]*domain.Registration{},
		answers:  map[uuid.UUID]map[string]*domain.Answer{},
		support:  map[uuid.UUID]supportRow{},
		jobs:     map[uuid.UUID]*domain.Job{},
		apps:     map[[2]uuid.UUID]*domain.Application{},
	}
}

func clone[T any](v *T) *T {
	c := *v
	return &c
}

// ---- learners ----

type fakeLearners struct{ s *memStore }

func (f fakeLearners) GetByID(_ context.Context, id uuid.UUID) (*domain.Learner, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	l, ok := f.s.learners[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return clone(l), nil
}

func (f fakeLearners) GetByIDAndPartnerID(ctx context.Context, id, partnerID uuid.UUID) (*domain.Learner, error) {
	l, err := f.GetByID(ctx, id)
	if err != nil || l.PartnerID != partnerID {
		return nil, domain.ErrNotFound
	}
	return l, nil
}

func (f fakeLearners) ListByPartnerID(_ context.Context, partnerID uuid.UUID) ([]*domain.Learner, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	out := []*domain.Learner{}
	for _, l := range f.s.learners {
		if l.PartnerID == partnerID {
			out = append(out, clone(l))
		}
	}
	return out, nil
}

func (f fakeLearners) UpdatePreferences(_ context.Context, id uuid.UUID, language *string, simple *bool) error {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	l, ok := f.s.learners[id]
	if !ok {
		return domain.ErrNotFound
	}
	if language != nil {
		l.Language = *language
	}
	if simple != nil {
		l.SimpleMode = *simple
	}
	return nil
}

func (f fakeLearners) GetLatestReferral(_ context.Context, learnerID uuid.UUID) (*domain.Referral, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	for i := len(f.s.referrals) - 1; i >= 0; i-- {
		if f.s.referrals[i].LearnerID == learnerID {
			return clone(f.s.referrals[i]), nil
		}
	}
	return nil, domain.ErrNotFound
}

// ---- registrations ----

type fakeRegistrations struct{ s *memStore }

func (f fakeRegistrations) Start(_ context.Context, learner *domain.Learner, reg *domain.Registration) (*domain.Learner, *domain.Registration, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	now := time.Now().UTC()
	l := clone(learner)
	l.ID, l.Status, l.IdentityLevel, l.CreatedAt, l.UpdatedAt = uuid.New(), domain.LearnerStatusDraft, domain.IdentitySelfDeclared, now, now
	r := clone(reg)
	r.ID, r.LearnerID, r.Status, r.CreatedAt, r.UpdatedAt = uuid.New(), l.ID, domain.RegistrationStatusDraft, now, now
	f.s.learners[l.ID] = l
	f.s.regs[r.ID] = r
	return clone(l), clone(r), nil
}

func (f fakeRegistrations) GetAnswer(_ context.Context, regID uuid.UUID, questionID string) (*domain.Answer, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	a, ok := f.s.answers[regID][questionID]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return clone(a), nil
}

func (f fakeRegistrations) GetRegistrationByID(_ context.Context, id uuid.UUID) (*domain.Registration, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	r, ok := f.s.regs[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return clone(r), nil
}

func (f fakeRegistrations) UpdateProgress(_ context.Context, id uuid.UUID, step string) error {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	r, ok := f.s.regs[id]
	if !ok {
		return domain.ErrNotFound
	}
	r.CurrentStep = step
	return nil
}

func (f fakeRegistrations) ListAnswersByRegistrationID(_ context.Context, regID uuid.UUID) ([]*domain.Answer, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	out := []*domain.Answer{}
	for _, a := range f.s.answers[regID] {
		out = append(out, clone(a))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].QuestionID < out[j].QuestionID })
	return out, nil
}

// SaveAnswerIfVersion follows the SQL: a new answer always gets version 1; an existing one is
// replaced only if its version equals baseVersion.
func (f fakeRegistrations) SaveAnswerIfVersion(_ context.Context, a *domain.Answer, baseVersion int) (*domain.Answer, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	if f.s.answers[a.RegistrationID] == nil {
		f.s.answers[a.RegistrationID] = map[string]*domain.Answer{}
	}
	saved := clone(a)
	saved.UpdatedAt = time.Now().UTC()
	cur, exists := f.s.answers[a.RegistrationID][a.QuestionID]
	switch {
	case !exists:
		saved.Version = 1
	case cur.Version == baseVersion:
		saved.Version = cur.Version + 1
	default:
		return nil, &domain.ConflictError{Current: clone(cur)}
	}
	f.s.answers[a.RegistrationID][a.QuestionID] = saved
	return clone(saved), nil
}

func (f fakeRegistrations) SubmitTx(_ context.Context, regID uuid.UUID, profile *domain.Learner, ev *domain.IdentityEvidence, ref *domain.Referral) (*domain.SubmitResult, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	r, ok := f.s.regs[regID]
	if !ok || r.Status != domain.RegistrationStatusDraft {
		return nil, domain.ErrAlreadySubmitted
	}
	now := time.Now().UTC()
	r.Status, r.SubmittedAt = domain.RegistrationStatusSubmitted, &now

	l := f.s.learners[profile.ID]
	l.FullName, l.PreferredName, l.ContactMethod, l.PhoneE164 = profile.FullName, profile.PreferredName, profile.ContactMethod, profile.PhoneE164
	l.DOB, l.DOBCalendar = profile.DOB, profile.DOBCalendar
	l.Status, l.RegisteredAt = domain.LearnerStatusRegistered, &now

	e := clone(ev)
	e.ID, e.CreatedAt = uuid.New(), now
	f.s.evidence = append(f.s.evidence, e)
	result := &domain.SubmitResult{Learner: clone(l), Evidence: clone(e)}
	if ref != nil {
		rr := clone(ref)
		rr.ID, rr.Status, rr.CreatedAt = uuid.New(), domain.ReferralStatusRequested, now
		f.s.referrals = append(f.s.referrals, rr)
		result.Referral = clone(rr)
	}
	return result, nil
}

// ---- support ----

type fakeSupport struct{ s *memStore }

func (f fakeSupport) Upsert(_ context.Context, learnerID uuid.UUID, nonce, ciphertext []byte, shareCourses, shareEmployers bool) (time.Time, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	now := time.Now().UTC()
	f.s.support[learnerID] = supportRow{nonce, ciphertext, shareCourses, shareEmployers, now}
	return now, nil
}

func (f fakeSupport) Exists(_ context.Context, learnerID uuid.UUID) (bool, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	_, ok := f.s.support[learnerID]
	return ok, nil
}

// ---- partners ----

type fakePartners struct{ referral []*domain.Partner }

func (f fakePartners) GetByPublishableKey(context.Context, string) (*domain.Partner, error) {
	return nil, domain.ErrNotFound
}
func (f fakePartners) ListReferralPartners(context.Context) ([]*domain.Partner, error) {
	return f.referral, nil
}
func (f fakePartners) ListAllowedOrigins(context.Context) ([]string, error) { return nil, nil }
func (f fakePartners) GetByID(context.Context, uuid.UUID) (*domain.Partner, error) {
	return nil, domain.ErrNotFound
}
func (f fakePartners) GetByClientID(context.Context, string) (*domain.Partner, []byte, error) {
	return nil, nil, domain.ErrNotFound
}

// ---- sessions ----

type fakeSessions struct{}

func (fakeSessions) IssueLearnerSession(context.Context, uuid.UUID, uuid.UUID) (string, time.Time, error) {
	return "lt_test", time.Date(2026, 12, 14, 12, 0, 0, 0, time.UTC), nil
}

// ---- jobs ----

type fakeJobs struct{ s *memStore }

func (f fakeJobs) ListPublished(_ context.Context, limit int, after *domain.JobCursor) ([]*domain.Job, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	var all []*domain.Job
	for _, j := range f.s.jobs {
		if j.Status == domain.JobStatusPublished {
			all = append(all, j)
		}
	}
	// newest first, then by ID (descending), as in the SQL
	less := func(a, b *domain.Job) bool { // a comes before b
		if !a.PublishedAt.Equal(*b.PublishedAt) {
			return a.PublishedAt.After(*b.PublishedAt)
		}
		return a.ID.String() > b.ID.String()
	}
	sort.Slice(all, func(i, j int) bool { return less(all[i], all[j]) })
	var out []*domain.Job
	for _, j := range all {
		if after != nil && !less(&domain.Job{PublishedAt: &after.PublishedAt, ID: after.ID}, j) {
			continue
		}
		out = append(out, clone(j))
		if len(out) == limit {
			break
		}
	}
	return out, nil
}

func (f fakeJobs) GetPublished(_ context.Context, id uuid.UUID) (*domain.Job, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	j, ok := f.s.jobs[id]
	if !ok || j.Status != domain.JobStatusPublished {
		return nil, domain.ErrNotFound
	}
	return clone(j), nil
}

func (f fakeJobs) ListByEmployer(_ context.Context, employerID uuid.UUID) ([]*domain.Job, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	out := []*domain.Job{}
	for _, j := range f.s.jobs {
		if j.EmployerID != nil && *j.EmployerID == employerID {
			out = append(out, clone(j))
		}
	}
	return out, nil
}

func (f fakeJobs) Create(_ context.Context, job *domain.Job) (*domain.Job, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	j := clone(job)
	j.ID, j.CreatedAt = uuid.New(), time.Now().UTC()
	f.s.jobs[j.ID] = j
	return clone(j), nil
}

func (f fakeJobs) Publish(_ context.Context, id, employerID uuid.UUID) (*domain.Job, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	j, ok := f.s.jobs[id]
	if !ok || j.EmployerID == nil || *j.EmployerID != employerID {
		return nil, domain.ErrNotFound
	}
	if j.PublishedAt == nil {
		now := time.Now().UTC()
		j.PublishedAt = &now
	}
	j.Status = domain.JobStatusPublished
	return clone(j), nil
}

// ---- applications ----

type fakeApplications struct{ s *memStore }

func (f fakeApplications) ListForLearner(_ context.Context, learnerID uuid.UUID) ([]*domain.LearnerApplication, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	var out []*domain.LearnerApplication
	for _, a := range f.s.apps {
		if a.LearnerID == learnerID {
			out = append(out, &domain.LearnerApplication{ID: a.ID, JobID: a.JobID, Status: a.Status, ShareSupport: a.AttachSupport, CreatedAt: a.CreatedAt})
		}
	}
	return out, nil
}

func (f fakeApplications) SetSupportSharing(_ context.Context, learnerID, applicationID uuid.UUID, share bool) error {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	for _, a := range f.s.apps {
		if a.ID == applicationID && a.LearnerID == learnerID {
			a.AttachSupport = share
			return nil
		}
	}
	return domain.ErrNotFound
}

func (f fakeApplications) Create(_ context.Context, app *domain.Application) (*domain.Application, error) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	key := [2]uuid.UUID{app.JobID, app.LearnerID}
	if _, dup := f.s.apps[key]; dup {
		return nil, domain.ErrAlreadyExists
	}
	a := clone(app)
	a.ID, a.Status, a.CreatedAt = uuid.New(), domain.ApplicationStatusSubmitted, time.Now().UTC()
	f.s.apps[key] = a
	return clone(a), nil
}

// ---- shared fixtures ----

// loadFlows loads the real shared flow files, so the tests check the actual contract.
func loadFlows(t *testing.T) *infrastructure.FlowStore {
	t.Helper()
	flows, err := infrastructure.LoadFlowStore("../../shared/flows", "../../shared/vocab/needs.json")
	if err != nil {
		t.Fatalf("load flows: %v", err)
	}
	return flows
}

// testKey is a fixed 32-byte AES key (base64) for tests only.
const testKey = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
