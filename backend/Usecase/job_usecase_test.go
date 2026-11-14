package usecase

import (
	"context"
	"encoding/json"
	"flag"
	"os"
	"testing"
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var updateGolden = flag.Bool("update", false, "rewrite testdata golden files")

var (
	employerA = uuid.MustParse("e1000000-0000-4000-8000-00000000000a")
	employerB = uuid.MustParse("e1000000-0000-4000-8000-00000000000b")
)

func employerActor(id uuid.UUID) domain.Actor {
	return domain.Actor{Kind: domain.ActorStaff, ID: uuid.New(), Role: domain.RoleEmployer, EmployerID: &id}
}

func newJobFixture(t *testing.T) (*JobUsecase, *memStore) {
	t.Helper()
	s := newMemStore()
	return NewJobUsecase(fakeJobs{s}, loadFlows(t), "https://bridge.example/"), s
}

func TestBuildJobPostingMatchesGoldenFile(t *testing.T) {
	published := time.Date(2026, 11, 14, 10, 0, 0, 0, time.UTC)
	job := &domain.Job{
		ID:             uuid.MustParse("4a0c7d5e-1111-4222-8333-444455556666"),
		Title:          "Junior Data Analyst",
		Description:    "Clean and report data for our training programmes.",
		LocationType:   "hybrid",
		LocationText:   "Addis Ababa",
		WorkHours:      "Mon–Fri, 9:00–17:00",
		EmploymentType: "full_time",
		Accommodations: []string{"flexible_hours", "screen_reader", "remote_work"},
		Status:         domain.JobStatusPublished,
		PublishedAt:    &published,
	}
	got, err := json.MarshalIndent(BuildJobPosting(job, "Example Co", "https://bridge.example/ns/accommodations#"), "", "  ")
	require.NoError(t, err)

	const golden = "testdata/jobposting.json"
	if *updateGolden {
		require.NoError(t, os.WriteFile(golden, append(got, '\n'), 0o644))
	}
	want, err := os.ReadFile(golden)
	require.NoError(t, err)
	assert.JSONEq(t, string(want), string(got))
}

func TestBuildJobPostingRemoteJob(t *testing.T) {
	job := &domain.Job{Title: "Support agent", Description: "Answer chats.", LocationType: "remote", EmploymentType: "part_time", Accommodations: []string{"remote_work"}}
	p := BuildJobPosting(job, "Example Co", "https://bridge.example/ns/accommodations#")
	assert.Equal(t, "TELECOMMUTE", p["jobLocationType"])
	assert.Equal(t, "PART_TIME", p["employmentType"])
	assert.NotContains(t, p, "jobLocation", "no place for a fully remote job without a location")

	onsite := BuildJobPosting(&domain.Job{LocationType: "onsite"}, "Example Co", "x")
	assert.NotContains(t, onsite, "jobLocationType")
	assert.NotContains(t, onsite, "jobBenefits")
	assert.Equal(t, []string{}, onsite["acc:offers"])
}

func TestEmployerJobsNeedTheEmployerRole(t *testing.T) {
	uc, _ := newJobFixture(t)
	ctx := context.Background()

	_, err := uc.ListEmployerJobs(ctx, domain.Actor{Kind: domain.ActorAnonymous})
	assert.ErrorIs(t, err, domain.ErrUnauthorized)
	_, err = uc.ListEmployerJobs(ctx, domain.Actor{Kind: domain.ActorLearner, ID: uuid.New()})
	assert.ErrorIs(t, err, domain.ErrForbidden)
	_, err = uc.CreateEmployerJob(ctx, domain.Actor{Kind: domain.ActorStaff, ID: uuid.New(), Role: domain.RoleSupport}, &domain.Job{})
	assert.ErrorIs(t, err, domain.ErrForbidden)
}

func validJob() *domain.Job {
	return &domain.Job{
		Title: " Junior Data Analyst ", Description: "Clean data.", LocationType: "hybrid", LocationText: "Addis Ababa",
		EmploymentType: "full_time", Accommodations: []string{"screen_reader", "flexible_hours", "screen_reader"},
	}
}

func TestCreateEmployerJob(t *testing.T) {
	uc, s := newJobFixture(t)
	job, err := uc.CreateEmployerJob(context.Background(), employerActor(employerA), validJob())
	require.NoError(t, err)

	assert.Equal(t, "Junior Data Analyst", job.Title, "trimmed")
	assert.Equal(t, domain.JobStatusDraft, job.Status)
	assert.Equal(t, domain.JobSourceLocal, job.Source)
	assert.Equal(t, employerA, *job.EmployerID, "always the signed-in employer")
	assert.Equal(t, []string{"screen_reader", "flexible_hours"}, job.Accommodations, "duplicates removed")
	assert.Len(t, s.jobs, 1)

	// Drafts are not public.
	_, err = uc.GetJob(context.Background(), job.ID)
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestCreateEmployerJobValidation(t *testing.T) {
	uc, s := newJobFixture(t)
	ctx := context.Background()

	bad := validJob()
	bad.Title, bad.LocationText, bad.EmploymentType = "", "", "gig"
	bad.Accommodations = []string{"other"}
	_, err := uc.CreateEmployerJob(ctx, employerActor(employerA), bad)
	assert.Equal(t, map[string]string{
		"title": "required", "location_text": "required", "employment_type": "invalid_choice", "accommodations": "invalid_choice",
	}, fieldCodes(t, err))

	unknown := validJob()
	unknown.Accommodations = []string{"jetpack"}
	_, err = uc.CreateEmployerJob(ctx, employerActor(employerA), unknown)
	assert.Equal(t, map[string]string{"accommodations": "invalid_choice"}, fieldCodes(t, err))
	assert.Empty(t, s.jobs)

	// A remote job doesn't need a place.
	remote := validJob()
	remote.LocationType, remote.LocationText = "remote", ""
	_, err = uc.CreateEmployerJob(ctx, employerActor(employerA), remote)
	assert.NoError(t, err)
}

func TestPublishOnlyYourOwnJob(t *testing.T) {
	uc, _ := newJobFixture(t)
	ctx := context.Background()
	job, err := uc.CreateEmployerJob(ctx, employerActor(employerA), validJob())
	require.NoError(t, err)

	_, _, err = uc.PublishEmployerJob(ctx, employerActor(employerB), job.ID)
	assert.ErrorIs(t, err, domain.ErrNotFound, "another employer's job looks like it doesn't exist")

	published, url, err := uc.PublishEmployerJob(ctx, employerActor(employerA), job.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.JobStatusPublished, published.Status)
	assert.Equal(t, "https://bridge.example/api/v1/jobs/"+job.ID.String()+"/jobposting.jsonld", url)

	public, err := uc.GetJob(ctx, job.ID)
	require.NoError(t, err)
	assert.Equal(t, job.ID, public.ID)

	posting, err := uc.GetJobPosting(ctx, job.ID)
	require.NoError(t, err)
	assert.Equal(t, "JobPosting", posting["@type"])

	mine, err := uc.ListEmployerJobs(ctx, employerActor(employerA))
	require.NoError(t, err)
	assert.Len(t, mine, 1)
	theirs, err := uc.ListEmployerJobs(ctx, employerActor(employerB))
	require.NoError(t, err)
	assert.Empty(t, theirs)
}

func TestListJobsPagesWithACursor(t *testing.T) {
	uc, s := newJobFixture(t)
	base := time.Date(2026, 11, 14, 8, 0, 0, 0, time.UTC)
	for i := 0; i < 25; i++ {
		at := base.Add(time.Duration(i) * time.Minute)
		if i == 24 {
			at = base.Add(23 * time.Minute) // two jobs published at the same moment
		}
		id := uuid.New()
		s.jobs[id] = &domain.Job{ID: id, Title: "Job", Status: domain.JobStatusPublished, PublishedAt: &at}
	}
	draftID := uuid.New()
	s.jobs[draftID] = &domain.Job{ID: draftID, Status: domain.JobStatusDraft}

	page1, next, err := uc.ListJobs(context.Background(), 0, "")
	require.NoError(t, err)
	assert.Len(t, page1, defaultJobsPage)
	require.NotNil(t, next)

	page2, next2, err := uc.ListJobs(context.Background(), 20, *next)
	require.NoError(t, err)
	assert.Len(t, page2, 5)
	assert.Nil(t, next2)

	seen := map[uuid.UUID]bool{}
	for _, j := range append(page1, page2...) {
		assert.False(t, seen[j.ID], "a job appears twice")
		seen[j.ID] = true
	}
	assert.Len(t, seen, 25)
	assert.False(t, seen[draftID])

	_, _, err = uc.ListJobs(context.Background(), 20, "not-a-cursor")
	assert.Equal(t, map[string]string{"cursor": "invalid"}, fieldCodes(t, err))
}
