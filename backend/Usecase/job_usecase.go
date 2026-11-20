package usecase

import (
	"context"
	"encoding/base64"
	"strings"
	"time"
	"unicode/utf8"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// JobUsecase: public job list and detail, JobPosting JSON-LD, employer create/list/publish
// (C2, C3, I4).
type JobUsecase struct {
	JobRepo   domain.JobRepositoryI
	Flows     domain.FlowStore // the needs vocabulary, for accommodation codes
	PublicURL string           // PUBLIC_WEB_URL: base of the JSON-LD links
}

var _ domain.JobUsecaseI = (*JobUsecase)(nil)

func NewJobUsecase(jrp domain.JobRepositoryI, flows domain.FlowStore, publicURL string) *JobUsecase {
	return &JobUsecase{
		JobRepo:   jrp,
		Flows:     flows,
		PublicURL: strings.TrimRight(publicURL, "/"),
	}
}

const (
	defaultJobsPage = 20
	maxJobsPage     = 100
)

var (
	locationTypes   = map[string]bool{"onsite": true, "remote": true, "hybrid": true}
	employmentTypes = map[string]bool{"full_time": true, "part_time": true, "contract": true, "internship": true, "temporary": true}
)

// ListJobs returns one page of published jobs, newest first. Matching jobs to a learner's
// needs happens in the browser, so the needs never leave the learner's device for this.
func (uc *JobUsecase) ListJobs(ctx context.Context, limit int, cursor string) ([]*domain.Job, *string, error) {
	if limit <= 0 {
		limit = defaultJobsPage
	}
	if limit > maxJobsPage {
		limit = maxJobsPage
	}
	after, err := decodeJobCursor(cursor)
	if err != nil {
		return nil, nil, err
	}
	jobs, err := uc.JobRepo.ListPublished(ctx, limit+1, after) // one extra tells us if there is a next page
	if err != nil {
		return nil, nil, err
	}
	var next *string
	if len(jobs) > limit {
		jobs = jobs[:limit]
		c := encodeJobCursor(jobs[limit-1])
		next = &c
	}
	return jobs, next, nil
}

func (uc *JobUsecase) GetJob(ctx context.Context, id uuid.UUID) (*domain.Job, error) {
	return uc.JobRepo.GetPublished(ctx, id)
}

// GetJobPosting returns a published job as schema.org JobPosting JSON-LD (I4), so job boards
// and search engines can read it, accommodations included.
func (uc *JobUsecase) GetJobPosting(ctx context.Context, id uuid.UUID) (map[string]any, error) {
	job, err := uc.JobRepo.GetPublished(ctx, id)
	if err != nil {
		return nil, err
	}
	return uc.jobPosting(job), nil
}

// jobApplyPath is the hosted page that opens one job in the widget, ready to apply
// (frontend/apply.html). JobPostings link to it, so a board that shows our job can send the
// learner back to apply.
const jobApplyPath = "/apply.html?job="

// maxFeedJobs: the most jobs in one feed (the newest).
const maxFeedJobs = 500

// jobPosting is BuildJobPosting plus the link to apply on Bridge (url).
func (uc *JobUsecase) jobPosting(job *domain.Job) map[string]any {
	p := BuildJobPosting(job, job.EmployerName, uc.PublicURL+accommodationsNamespacePath)
	p["url"] = uc.PublicURL + jobApplyPath + job.ID.String()
	return p
}

// GetJobPostingFeed returns every published job (newest first, at most maxFeedJobs) as one
// JSON-LD document: a shared @context and a @graph of JobPostings, for boards that want all
// our jobs in one request.
func (uc *JobUsecase) GetJobPostingFeed(ctx context.Context) (map[string]any, error) {
	jobs, err := uc.JobRepo.ListPublished(ctx, maxFeedJobs, nil)
	if err != nil {
		return nil, err
	}
	graph := make([]any, 0, len(jobs))
	for _, job := range jobs {
		p := uc.jobPosting(job)
		delete(p, "@context") // one shared context for the whole feed
		graph = append(graph, p)
	}
	return map[string]any{
		"@context": []any{"https://schema.org", map[string]any{"acc": uc.PublicURL + accommodationsNamespacePath}},
		"@graph":   graph,
	}, nil
}

// AccommodationsVocabulary returns the JSON-LD document that defines the "acc" prefix.
func (uc *JobUsecase) AccommodationsVocabulary() map[string]any {
	var codes []string
	if uc.Flows != nil {
		codes = uc.Flows.NeedCodes()
	}
	return AccommodationsVocabulary(uc.PublicURL, codes)
}

// ListEmployerJobs returns the signed-in employer's own jobs, drafts included (Q7).
func (uc *JobUsecase) ListEmployerJobs(ctx context.Context, actor domain.Actor) ([]*domain.Job, error) {
	employerID, err := employerOf(actor)
	if err != nil {
		return nil, err
	}
	return uc.JobRepo.ListByEmployer(ctx, employerID)
}

// CreateEmployerJob saves a draft job for the signed-in employer.
func (uc *JobUsecase) CreateEmployerJob(ctx context.Context, actor domain.Actor, job *domain.Job) (*domain.Job, error) {
	employerID, err := employerOf(actor)
	if err != nil {
		return nil, err
	}
	clean, err := uc.cleanJob(job)
	if err != nil {
		return nil, err
	}
	clean.EmployerID = &employerID
	return uc.JobRepo.Create(ctx, clean)
}

// PublishEmployerJob makes a draft public. An employer can only publish their own jobs;
// another employer's job looks like it doesn't exist (404), so IDs can't be probed.
func (uc *JobUsecase) PublishEmployerJob(ctx context.Context, actor domain.Actor, id uuid.UUID) (*domain.Job, string, error) {
	employerID, err := employerOf(actor)
	if err != nil {
		return nil, "", err
	}
	job, err := uc.JobRepo.Publish(ctx, id, employerID)
	if err != nil {
		return nil, "", err
	}
	return job, uc.PublicURL + "/api/v1/jobs/" + job.ID.String() + "/jobposting.jsonld", nil
}

// employerOf returns the employer the actor works for: only staff with the employer role.
func employerOf(actor domain.Actor) (uuid.UUID, error) {
	if actor.IsAnonymous() {
		return uuid.Nil, domain.ErrUnauthorized
	}
	if actor.Kind != domain.ActorStaff || actor.Role != domain.RoleEmployer || actor.EmployerID == nil {
		return uuid.Nil, domain.ErrForbidden
	}
	return *actor.EmployerID, nil
}

// cleanJob trims the text and checks every field, reporting all problems at once.
func (uc *JobUsecase) cleanJob(in *domain.Job) (*domain.Job, error) {
	j := &domain.Job{
		Source:         domain.JobSourceLocal,
		Status:         domain.JobStatusDraft,
		Title:          strings.TrimSpace(in.Title),
		Description:    strings.TrimSpace(in.Description),
		LocationType:   in.LocationType,
		LocationText:   strings.TrimSpace(in.LocationText),
		WorkHours:      strings.TrimSpace(in.WorkHours),
		EmploymentType: in.EmploymentType,
	}
	verr := &domain.ValidationError{}
	add := func(field, code string) {
		verr.Fields = append(verr.Fields, domain.FieldError{Field: field, Code: code})
	}

	checkLength := func(field, value string, minLen, maxLen int, required bool) {
		n := utf8.RuneCountInString(value)
		switch {
		case n == 0 && required:
			add(field, codeRequired)
		case n > 0 && n < minLen:
			add(field, "too_short")
		case n > maxLen:
			add(field, codeTooLong)
		}
	}
	checkLength("title", j.Title, 2, 200, true)
	checkLength("description", j.Description, 1, 3000, true)
	checkLength("work_hours", j.WorkHours, 1, 200, false)
	// As in the employer-job flow: a place is needed unless the job is fully remote.
	checkLength("location_text", j.LocationText, 1, 200, j.LocationType != domain.LocationRemote)
	if !locationTypes[j.LocationType] {
		add("location_type", codeInvalidChoice)
	}
	if !employmentTypes[j.EmploymentType] {
		add("employment_type", codeInvalidChoice)
	}

	j.Accommodations = make([]string, 0, len(in.Accommodations))
	seen := map[string]bool{}
	for _, code := range in.Accommodations {
		if !uc.Flows.IsNeedCode(code) || code == domain.NeedOther {
			add("accommodations", codeInvalidChoice)
			break
		}
		if !seen[code] {
			seen[code] = true
			j.Accommodations = append(j.Accommodations, code)
		}
	}

	if len(verr.Fields) > 0 {
		return nil, verr
	}
	return j, nil
}

// ---- page cursor ----

// The cursor is the (published_at, id) of the last job on a page, base64url-encoded,
// so the next page starts right after it even if new jobs were published in between.

func encodeJobCursor(j *domain.Job) string {
	var at time.Time
	if j.PublishedAt != nil {
		at = *j.PublishedAt
	}
	return base64.RawURLEncoding.EncodeToString([]byte(at.UTC().Format(time.RFC3339Nano) + "|" + j.ID.String()))
}

func decodeJobCursor(s string) (*domain.JobCursor, error) {
	if s == "" {
		return nil, nil
	}
	bad := domain.NewValidationError("cursor", codeInvalid)
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, bad
	}
	at, id, ok := strings.Cut(string(raw), "|")
	if !ok {
		return nil, bad
	}
	publishedAt, err := time.Parse(time.RFC3339Nano, at)
	if err != nil {
		return nil, bad
	}
	jobID, err := uuid.Parse(id)
	if err != nil {
		return nil, bad
	}
	return &domain.JobCursor{PublishedAt: publishedAt, ID: jobID}, nil
}
