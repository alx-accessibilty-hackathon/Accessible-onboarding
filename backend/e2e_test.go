package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	controllers "bridge/Delivery/Controllers"
	domain "bridge/Domain"
	infrastructure "bridge/Infrastructure"
	repository "bridge/Repository"
	"bridge/Repository/repotest"
	sqlc "bridge/Repository/sqlc"
	usecase "bridge/Usecase"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// End-to-end: real controllers, use cases, repositories and PostgreSQL, called over HTTP on
// the same paths as Delivery/Routers/router.go. Skipped unless TEST_DATABASE_URL is set.
//
// The sign-in middlewares are still skeletons (Dev B), so this test sets the caller itself
// from test-only headers: X-Test-Learner: <learner id>, X-Test-Employer: <employer id>.

type e2e struct {
	t        *testing.T
	router   *gin.Engine
	platform uuid.UUID
}

func newE2E(t *testing.T) (*e2e, *sqlc.Queries, map[string]uuid.UUID) {
	db := repotest.NewDB(t)
	ctx := context.Background()
	ids := map[string]uuid.UUID{}
	for name, sql := range map[string]string{
		"platform":  `INSERT INTO partners (slug, name, kind, publishable_key) VALUES ('savanna', 'Savanna (demo)', 'platform', 'pk_demo_savanna') RETURNING id`,
		"aaapd":     `INSERT INTO partners (slug, name, kind, publishable_key) VALUES ('aaapd', 'AAAPD', 'referral_org', 'pk_demo_aaapd') RETURNING id`,
		"employer":  `INSERT INTO employers (name) VALUES ('Example Co') RETURNING id`,
		"employer2": `INSERT INTO employers (name) VALUES ('Other Co') RETURNING id`,
	} {
		var id uuid.UUID
		require.NoError(t, db.QueryRow(ctx, sql).Scan(&id))
		ids[name] = id
	}
	q := sqlc.New(db)
	require.NoError(t, repository.SeedJobs(ctx, q, ids["employer"]))

	flows, err := infrastructure.LoadFlowStore("../shared/flows", "../shared/vocab/needs.json")
	require.NoError(t, err)
	security := infrastructure.InitSecurityService("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=", "")

	partnerRepo, learnerRepo, registrationRepo := repository.NewPartnerRepo(db), repository.NewLearnerRepo(db), repository.NewRegistrationRepo(db)
	supportRepo, jobRepo := repository.NewSupportRepo(db), repository.NewJobRepo(db)
	auth := usecase.NewAuthUsecase(repository.NewSessionRepo(db), repository.NewStaffRepo(db), partnerRepo, learnerRepo, security)

	reg := controllers.NewRegistrationController(usecase.NewRegistrationUsecase(learnerRepo, registrationRepo, supportRepo, partnerRepo, auth, flows, nil, security, nil))
	sup := controllers.NewSupportController(usecase.NewSupportUsecase(supportRepo, registrationRepo, flows, security))
	job := controllers.NewJobController(usecase.NewJobUsecase(jobRepo, flows, "https://bridge.example"))
	app := controllers.NewApplicationController(usecase.NewApplicationUsecase(repository.NewApplicationRepo(db), jobRepo, learnerRepo))

	gin.SetMode(gin.TestMode)
	r := gin.New()
	platform := ids["platform"]
	r.Use(func(c *gin.Context) { // stands in for PartnerKey + LearnerAuth / StaffAuth
		actor := domain.Actor{Kind: domain.ActorAnonymous, PartnerID: platform}
		if id, err := uuid.Parse(c.GetHeader("X-Test-Learner")); err == nil {
			actor = domain.Actor{Kind: domain.ActorLearner, ID: id, PartnerID: platform}
		}
		if id, err := uuid.Parse(c.GetHeader("X-Test-Employer")); err == nil {
			actor = domain.Actor{Kind: domain.ActorStaff, ID: uuid.New(), Role: domain.RoleEmployer, EmployerID: &id}
		}
		infrastructure.SetActor(c, actor)
	})
	v1 := r.Group("/api/v1")
	v1.POST("/registrations", reg.CreateRegistrationController)
	v1.GET("/registrations/:id", reg.GetRegistrationController)
	v1.PATCH("/registrations/:id", reg.UpdateProgressController)
	v1.PUT("/registrations/:id/answers/:questionId", reg.SaveAnswerController)
	v1.PUT("/registrations/:id/support-request", sup.SaveSupportRequestController)
	v1.POST("/registrations/:id/submit", reg.SubmitRegistrationController)
	v1.GET("/jobs", job.ListJobsController)
	v1.GET("/jobs/:id", job.GetJobController)
	v1.GET("/jobs/:id/jobposting.jsonld", job.GetJobPostingController)
	v1.POST("/jobs/:id/applications", app.CreateApplicationController)
	v1.GET("/employer/jobs", job.ListEmployerJobsController)
	v1.POST("/employer/jobs", job.CreateEmployerJobController)
	v1.POST("/employer/jobs/:id/publish", job.PublishEmployerJobController)

	return &e2e{t: t, router: r, platform: platform}, q, ids
}

// call sends a request and decodes the JSON answer into out (if not nil).
func (e *e2e) call(method, path string, headers map[string]string, body string, out any) *httptest.ResponseRecorder {
	e.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	e.router.ServeHTTP(w, req)
	if out != nil && w.Body.Len() > 0 {
		require.NoError(e.t, json.Unmarshal(w.Body.Bytes(), out), w.Body.String())
	}
	return w
}

func TestLearnerSignsUpAndApplies(t *testing.T) {
	e, q, _ := newE2E(t)

	// 1. Start (the widget, with only the partner key).
	var created struct {
		RegistrationID uuid.UUID              `json:"registration_id"`
		LearnerID      uuid.UUID              `json:"learner_id"`
		Status         string                 `json:"status"`
		CurrentStep    string                 `json:"current_step"`
		Session        struct{ Token string } `json:"session"`
	}
	w := e.call("POST", "/api/v1/registrations", nil, `{"flow_id":"signup","language":"am","simple_mode":true}`, &created)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	assert.Equal(t, "draft", created.Status)
	assert.Equal(t, "welcome", created.CurrentStep)
	assert.NotEmpty(t, created.Session.Token)

	me := map[string]string{"X-Test-Learner": created.LearnerID.String()}
	base := "/api/v1/registrations/" + created.RegistrationID.String()

	// 2. Answers, one per screen.
	answers := []struct{ q, body string }{
		{"full_name", `{"value":"አበበ ከበደ","input_method":"voice","base_version":0}`},
		{"contact_method", `{"value":"phone","input_method":"choice","base_version":0}`},
		{"phone", `{"value":"0912 345 678","input_method":"voice","base_version":0}`},
		{"dob", `{"value":{"calendar":"ethiopian","ethiopian":{"year":2010,"month":1,"day":15},"iso":"2017-09-25"},"input_method":"typed","base_version":0}`},
		{"id_route", `{"value":"fayda","input_method":"choice","base_version":0}`},
		{"id_last4", `{"value":"4821","input_method":"typed","base_version":0}`},
	}
	for _, a := range answers {
		w := e.call("PUT", base+"/answers/"+a.q, me, a.body, nil)
		require.Equal(t, http.StatusOK, w.Code, "%s: %s", a.q, w.Body.String())
	}
	var phone struct {
		Value   string `json:"value"`
		Version int    `json:"version"`
	}
	e.call("PUT", base+"/answers/phone", me, `{"value":"+251 91 234 5678","input_method":"typed","base_version":1}`, &phone)
	assert.Equal(t, "+251912345678", phone.Value, "stored in E.164")
	assert.Equal(t, 2, phone.Version)

	// Another device with an old version: 409 with the saved answer.
	var conflict struct {
		Code    string `json:"code"`
		Current struct {
			Value   string `json:"value"`
			Version int    `json:"version"`
		} `json:"current"`
	}
	w = e.call("PUT", base+"/answers/phone", me, `{"value":"0911000000","input_method":"typed","base_version":1}`, &conflict)
	assert.Equal(t, http.StatusConflict, w.Code)
	assert.Equal(t, "answer_conflict", conflict.Code)
	assert.Equal(t, 2, conflict.Current.Version)

	// A bad phone number: 422 on "value".
	w = e.call("PUT", base+"/answers/phone", me, `{"value":"12345","input_method":"typed","base_version":2}`, nil)
	assert.Equal(t, http.StatusUnprocessableEntity, w.Code)
	assert.Contains(t, w.Body.String(), `{"field":"value","code":"phone_invalid"}`)

	// Someone else's registration: 403.
	w = e.call("GET", base, map[string]string{"X-Test-Learner": uuid.NewString()}, "", nil)
	assert.Equal(t, http.StatusForbidden, w.Code)

	// 3. Progress and support needs.
	w = e.call("PATCH", base, me, `{"current_step":"support_needs","language":"en"}`, nil)
	assert.Equal(t, http.StatusNoContent, w.Code, w.Body.String())
	w = e.call("PUT", base+"/support-request", me, `{"needs":["screen_reader","extra_time"],"other_text":"I need breaks every hour","share_with":{"courses":false,"employers":true}}`, nil)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.NotContains(t, w.Body.String(), "screen_reader", "the answer never repeats the needs")
	row, err := q.GetSupportRequestByLearner(context.Background(), created.LearnerID)
	require.NoError(t, err)
	assert.False(t, bytes.Contains(row.Ciphertext, []byte("screen_reader")), "only ciphertext in the database")

	// 4. Read it back (another device would do this).
	var view struct {
		CurrentStep string                     `json:"current_step"`
		Language    string                     `json:"language"`
		Answers     map[string]json.RawMessage `json:"answers"`
		Support     struct{ Submitted bool }   `json:"support_request"`
	}
	w = e.call("GET", base, me, "", &view)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "support_needs", view.CurrentStep)
	assert.Equal(t, "en", view.Language)
	assert.Len(t, view.Answers, 6)
	assert.True(t, view.Support.Submitted)
	assert.NotContains(t, w.Body.String(), "screen_reader")

	// 5. Submit.
	var submitted struct {
		Status        string    `json:"status"`
		LearnerID     uuid.UUID `json:"learner_id"`
		IdentityLevel string    `json:"identity_level"`
		Referral      *struct{} `json:"referral"`
	}
	w = e.call("POST", base+"/submit", me, `{}`, &submitted)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, "registered", submitted.Status)
	assert.Equal(t, created.LearnerID, submitted.LearnerID)
	assert.Equal(t, "self_declared", submitted.IdentityLevel)
	assert.Nil(t, submitted.Referral)
	learner, err := q.GetLearnerByID(context.Background(), created.LearnerID)
	require.NoError(t, err)
	assert.Equal(t, "+251912345678", *learner.PhoneE164)
	assert.Equal(t, "2017-09-25", learner.Dob.Format("2006-01-02"))

	// 6. Jobs: list, one job, its JSON-LD.
	var list struct {
		Items []struct {
			ID             uuid.UUID             `json:"id"`
			Title          string                `json:"title"`
			Employer       struct{ Name string } `json:"employer"`
			Accommodations []string              `json:"accommodations"`
		} `json:"items"`
		NextCursor *string `json:"next_cursor"`
	}
	w = e.call("GET", "/api/v1/jobs?limit=4", nil, "", &list)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Len(t, list.Items, 4)
	require.NotNil(t, list.NextCursor)
	assert.Equal(t, "Example Co", list.Items[0].Employer.Name)
	w = e.call("GET", "/api/v1/jobs?limit=4&cursor="+*list.NextCursor, nil, "", &list)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Len(t, list.Items, 2)
	assert.Nil(t, list.NextCursor)

	jobID := list.Items[0].ID.String()
	w = e.call("GET", "/api/v1/jobs/"+jobID, nil, "", nil)
	assert.Equal(t, http.StatusOK, w.Code)
	w = e.call("GET", "/api/v1/jobs/"+jobID+"/jobposting.jsonld", nil, "", nil)
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/ld+json; charset=utf-8", w.Header().Get("Content-Type"))
	assert.Contains(t, w.Body.String(), `"@type":"JobPosting"`)
	assert.Contains(t, w.Body.String(), `"acc:offers"`)

	// 7. Apply, once.
	application := `{"answers":{"contact_confirm":{"value":"yes","input_method":"choice"},"motivation":{"value":"I like numbers.","input_method":"voice"}},"attach_support_request":true}`
	w = e.call("POST", "/api/v1/jobs/"+jobID+"/applications", me, application, nil)
	assert.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	w = e.call("POST", "/api/v1/jobs/"+jobID+"/applications", me, application, nil)
	assert.Equal(t, http.StatusConflict, w.Code)
	assert.Contains(t, w.Body.String(), `"already_exists"`)
}

func TestUnregisteredLearnerCannotApplyAndReferMeWorks(t *testing.T) {
	e, _, ids := newE2E(t)

	var created struct {
		RegistrationID uuid.UUID `json:"registration_id"`
		LearnerID      uuid.UUID `json:"learner_id"`
	}
	require.Equal(t, http.StatusCreated, e.call("POST", "/api/v1/registrations", nil, `{"flow_id":"signup","language":"am"}`, &created).Code)
	me := map[string]string{"X-Test-Learner": created.LearnerID.String()}
	base := "/api/v1/registrations/" + created.RegistrationID.String()

	var list struct {
		Items []struct{ ID uuid.UUID } `json:"items"`
	}
	e.call("GET", "/api/v1/jobs", nil, "", &list)
	require.NotEmpty(t, list.Items)
	w := e.call("POST", "/api/v1/jobs/"+list.Items[0].ID.String()+"/applications", me, `{"answers":{}}`, nil)
	assert.Equal(t, http.StatusForbidden, w.Code, "finish signing up first")

	// Submit too early: every missing required answer is listed.
	w = e.call("POST", base+"/submit", me, `{}`, nil)
	assert.Equal(t, http.StatusUnprocessableEntity, w.Code)
	assert.Contains(t, w.Body.String(), `{"field":"full_name","code":"required"}`)

	// "I have no ID": referred to AAAPD.
	for q, body := range map[string]string{
		"full_name":        `{"value":"Abebe Kebede","input_method":"typed","base_version":0}`,
		"contact_method":   `{"value":"partner","input_method":"choice","base_version":0}`,
		"id_route":         `{"value":"none","input_method":"choice","base_version":0}`,
		"referral_partner": `{"value":"` + ids["aaapd"].String() + `","input_method":"choice","base_version":0}`,
		"referral_contact": `{"value":"in_person","input_method":"choice","base_version":0}`,
	} {
		require.Equal(t, http.StatusOK, e.call("PUT", base+"/answers/"+q, me, body, nil).Code, q)
	}
	var submitted struct {
		Referral struct {
			PartnerName string `json:"partner_name"`
			Status      string `json:"status"`
		} `json:"referral"`
	}
	w = e.call("POST", base+"/submit", me, `{}`, &submitted)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, "AAAPD", submitted.Referral.PartnerName)
	assert.Equal(t, "requested", submitted.Referral.Status)

	// Submitting again (a retry) gives the same answer; changing answers is closed.
	w = e.call("POST", base+"/submit", me, `{}`, nil)
	assert.Equal(t, http.StatusOK, w.Code)
	w = e.call("PUT", base+"/answers/full_name", me, `{"value":"Changed","input_method":"typed","base_version":1}`, nil)
	assert.Equal(t, http.StatusConflict, w.Code)
	assert.Contains(t, w.Body.String(), `"already_submitted"`)
}

func TestEmployerCreatesAndPublishesAJob(t *testing.T) {
	e, _, ids := newE2E(t)
	employer := map[string]string{"X-Test-Employer": ids["employer"].String()}
	other := map[string]string{"X-Test-Employer": ids["employer2"].String()}

	w := e.call("POST", "/api/v1/employer/jobs", nil, `{"title":"Cook","description":"Cook lunch.","location_type":"onsite","location_text":"Addis Ababa","employment_type":"full_time"}`, nil)
	assert.Equal(t, http.StatusUnauthorized, w.Code, "not signed in")

	var job struct {
		ID     uuid.UUID `json:"id"`
		Status string    `json:"status"`
	}
	w = e.call("POST", "/api/v1/employer/jobs", employer,
		`{"title":"Junior Data Analyst","description":"Clean and report data.","location_type":"remote","employment_type":"full_time","accommodations":["remote_work","screen_reader"]}`, &job)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	assert.Equal(t, "draft", job.Status)

	w = e.call("POST", "/api/v1/employer/jobs", employer,
		`{"title":"Cook","description":"Cook lunch.","location_type":"onsite","employment_type":"full_time","accommodations":["jetpack"]}`, nil)
	assert.Equal(t, http.StatusUnprocessableEntity, w.Code)
	assert.Contains(t, w.Body.String(), `{"field":"location_text","code":"required"}`)
	assert.Contains(t, w.Body.String(), `{"field":"accommodations","code":"invalid_choice"}`)

	w = e.call("GET", "/api/v1/jobs/"+job.ID.String(), nil, "", nil)
	assert.Equal(t, http.StatusNotFound, w.Code, "drafts are not public")
	w = e.call("POST", "/api/v1/employer/jobs/"+job.ID.String()+"/publish", other, "", nil)
	assert.Equal(t, http.StatusNotFound, w.Code, "another employer can't publish it")

	var published struct {
		Status    string `json:"status"`
		JSONLDURL string `json:"jsonld_url"`
	}
	w = e.call("POST", "/api/v1/employer/jobs/"+job.ID.String()+"/publish", employer, "", &published)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, "published", published.Status)
	assert.Equal(t, "https://bridge.example/api/v1/jobs/"+job.ID.String()+"/jobposting.jsonld", published.JSONLDURL)

	w = e.call("GET", "/api/v1/jobs/"+job.ID.String()+"/jobposting.jsonld", nil, "", nil)
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"jobLocationType":"TELECOMMUTE"`)

	var mine struct {
		Items []struct{ ID uuid.UUID } `json:"items"`
	}
	e.call("GET", "/api/v1/employer/jobs", employer, "", &mine)
	assert.Len(t, mine.Items, 7, "6 demo jobs + the new one")
	e.call("GET", "/api/v1/employer/jobs", other, "", &mine)
	assert.Empty(t, mine.Items)
}
