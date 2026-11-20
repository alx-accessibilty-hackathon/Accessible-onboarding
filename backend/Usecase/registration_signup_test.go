package usecase

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"testing"

	domain "bridge/Domain"
	infrastructure "bridge/Infrastructure"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var (
	testPartnerID  = uuid.MustParse("0b6c0000-0000-4000-8000-000000000001")
	aaapdPartnerID = uuid.MustParse("7d210000-0000-4000-8000-000000000002")
)

type regFixture struct {
	uc    *RegistrationUsecase
	store *memStore
}

func newRegFixture(t *testing.T) regFixture {
	t.Helper()
	s := newMemStore()
	uc := NewRegistrationUsecase(
		fakeLearners{s}, fakeRegistrations{s}, fakeSupport{s},
		fakePartners{referral: []*domain.Partner{{ID: aaapdPartnerID, Name: "AAAPD"}}},
		fakeSessions{}, loadFlows(t),
		nil, nil, nil, // session repo, security, messages: only the resume features use them
	)
	return regFixture{uc: uc, store: s}
}

// start begins a sign-up through a partner's widget and returns the registration and the
// learner actor that the learner token would give.
func (f regFixture) start(t *testing.T) (*domain.Registration, domain.Actor) {
	t.Helper()
	reg, _, _, err := f.uc.Start(context.Background(), domain.Actor{Kind: domain.ActorAnonymous, PartnerID: testPartnerID}, "signup", 0, "am", false)
	require.NoError(t, err)
	return reg, domain.Actor{Kind: domain.ActorLearner, ID: reg.LearnerID, PartnerID: testPartnerID}
}

// save saves an answer on top of the latest saved version.
func (f regFixture) save(t *testing.T, actor domain.Actor, regID uuid.UUID, question, valueJSON string) *domain.Answer {
	t.Helper()
	base := 0
	if a, ok := f.store.answers[regID][question]; ok {
		base = a.Version
	}
	a, err := f.uc.SaveAnswer(context.Background(), actor, regID, question, json.RawMessage(valueJSON), "typed", base)
	require.NoError(t, err, "save %s", question)
	return a
}

// fieldCodes returns the field → code pairs of a validation error (fails the test otherwise).
func fieldCodes(t *testing.T, err error) map[string]string {
	t.Helper()
	var verr *domain.ValidationError
	require.True(t, errors.As(err, &verr), "want a validation error, got %v", err)
	out := map[string]string{}
	for _, f := range verr.Fields {
		out[f.Field] = f.Code
	}
	return out
}

func TestStartCreatesDraftAtFirstStepAndIssuesToken(t *testing.T) {
	f := newRegFixture(t)
	reg, token, expiresAt, err := f.uc.Start(context.Background(), domain.Actor{Kind: domain.ActorAnonymous, PartnerID: testPartnerID}, "signup", 1, " AM ", true)
	require.NoError(t, err)

	assert.Equal(t, "lt_test", token)
	assert.False(t, expiresAt.IsZero())
	assert.Equal(t, domain.RegistrationStatusDraft, reg.Status)
	assert.Equal(t, "welcome", reg.CurrentStep)
	assert.Equal(t, 1, reg.FlowVersion)

	learner := f.store.learners[reg.LearnerID]
	assert.Equal(t, testPartnerID, learner.PartnerID)
	assert.Equal(t, "am", learner.Language)
	assert.True(t, learner.SimpleMode)
}

func TestStartNeedsAPartnerKey(t *testing.T) {
	f := newRegFixture(t)
	_, _, _, err := f.uc.Start(context.Background(), domain.Actor{Kind: domain.ActorAnonymous}, "signup", 0, "am", false)
	assert.ErrorIs(t, err, domain.ErrUnauthorized)
}

func TestStartRejectsUnknownFlowVersionAndLanguage(t *testing.T) {
	f := newRegFixture(t)
	actor := domain.Actor{Kind: domain.ActorAnonymous, PartnerID: testPartnerID}

	_, _, _, err := f.uc.Start(context.Background(), actor, "job-application", 0, "am", false)
	assert.Equal(t, map[string]string{"flow_id": "invalid_choice"}, fieldCodes(t, err))

	_, _, _, err = f.uc.Start(context.Background(), actor, "signup", 99, "am", false)
	assert.Equal(t, map[string]string{"flow_version": "invalid_choice"}, fieldCodes(t, err))

	_, _, _, err = f.uc.Start(context.Background(), actor, "signup", 0, "amharic!", false)
	assert.Equal(t, map[string]string{"language": "invalid"}, fieldCodes(t, err))
}

func TestOnlyTheLearnerCanUseTheirRegistration(t *testing.T) {
	f := newRegFixture(t)
	reg, _ := f.start(t)
	ctx := context.Background()

	other := domain.Actor{Kind: domain.ActorLearner, ID: uuid.New(), PartnerID: testPartnerID}
	_, err := f.uc.Get(ctx, other, reg.ID)
	assert.ErrorIs(t, err, domain.ErrForbidden)
	_, err = f.uc.SaveAnswer(ctx, other, reg.ID, "full_name", json.RawMessage(`"Abebe"`), "typed", 0)
	assert.ErrorIs(t, err, domain.ErrForbidden)
	_, err = f.uc.Submit(ctx, other, reg.ID)
	assert.ErrorIs(t, err, domain.ErrForbidden)

	_, err = f.uc.Get(ctx, domain.Actor{Kind: domain.ActorAnonymous, PartnerID: testPartnerID}, reg.ID)
	assert.ErrorIs(t, err, domain.ErrUnauthorized)

	_, err = f.uc.Get(ctx, other, uuid.New())
	assert.ErrorIs(t, err, domain.ErrNotFound)

	// Partner staff helping this learner (E1) may.
	learnerID := reg.LearnerID
	staff := domain.Actor{Kind: domain.ActorStaff, ID: uuid.New(), Role: domain.RolePartnerStaff, ActingFor: &learnerID}
	_, err = f.uc.Get(ctx, staff, reg.ID)
	assert.NoError(t, err)
}

func TestGetReturnsAnswersAndOnlyWhetherSupportWasSent(t *testing.T) {
	f := newRegFixture(t)
	reg, actor := f.start(t)
	f.save(t, actor, reg.ID, "full_name", `"አበበ ከበደ"`)

	view, err := f.uc.Get(context.Background(), actor, reg.ID)
	require.NoError(t, err)
	require.Len(t, view.Answers, 1)
	assert.JSONEq(t, `"አበበ ከበደ"`, string(view.Answers[0].Value))
	assert.False(t, view.SupportSubmitted)
	assert.Equal(t, "am", view.Learner.Language)
}

func TestSaveAnswerWithStaleVersionReturnsConflict(t *testing.T) {
	f := newRegFixture(t)
	reg, actor := f.start(t)
	ctx := context.Background()

	first, err := f.uc.SaveAnswer(ctx, actor, reg.ID, "full_name", json.RawMessage(`"Abebe Kebede"`), "voice", 0)
	require.NoError(t, err)
	assert.Equal(t, 1, first.Version)

	// A second device that never saw version 1 also sends base_version 0.
	_, err = f.uc.SaveAnswer(ctx, actor, reg.ID, "full_name", json.RawMessage(`"Abebe K."`), "typed", 0)
	var conflict *domain.ConflictError
	require.True(t, errors.As(err, &conflict), "want ConflictError, got %v", err)
	assert.Equal(t, 1, conflict.Current.Version)
	assert.JSONEq(t, `"Abebe Kebede"`, string(conflict.Current.Value))

	// After seeing version 1, it can overwrite it.
	second, err := f.uc.SaveAnswer(ctx, actor, reg.ID, "full_name", json.RawMessage(`"Abebe K."`), "typed", 1)
	require.NoError(t, err)
	assert.Equal(t, 2, second.Version)
}

func TestSaveAnswerValidatesAgainstTheFlow(t *testing.T) {
	f := newRegFixture(t)
	reg, actor := f.start(t)
	ctx := context.Background()
	save := func(question, value string) error {
		_, err := f.uc.SaveAnswer(ctx, actor, reg.ID, question, json.RawMessage(value), "typed", 0)
		return err
	}

	assert.Equal(t, map[string]string{"value": "required"}, fieldCodes(t, save("full_name", `"   "`)))
	assert.Equal(t, map[string]string{"value": "required"}, fieldCodes(t, save("full_name", `null`)))
	assert.Equal(t, map[string]string{"value": "too_short"}, fieldCodes(t, save("full_name", `"A"`)))
	assert.Equal(t, map[string]string{"value": "phone_invalid"}, fieldCodes(t, save("phone", `"12345"`)))
	assert.Equal(t, map[string]string{"value": "invalid_choice"}, fieldCodes(t, save("contact_method", `"email"`)))
	assert.Equal(t, map[string]string{"value": "invalid_choice"}, fieldCodes(t, save("referral_partner", `"`+uuid.NewString()+`"`)))
	assert.Equal(t, map[string]string{"value": "last4_invalid"}, fieldCodes(t, save("id_last4", `"12-4"`)))
	assert.Equal(t, map[string]string{"value": "date_invalid"}, fieldCodes(t, save("dob", `{"calendar":"gregorian","iso":"2010-02-30"}`)))

	// Support needs and the consent screen have no answer endpoint; unknown steps neither.
	for _, q := range []string{"support_needs", "consent_data", "welcome", "nope"} {
		assert.Equal(t, map[string]string{"question_id": "unknown_question"}, fieldCodes(t, save(q, `"x"`)), q)
	}

	_, err := f.uc.SaveAnswer(ctx, actor, reg.ID, "full_name", json.RawMessage(`"Abebe"`), "telepathy", 0)
	assert.Equal(t, map[string]string{"input_method": "invalid_choice"}, fieldCodes(t, err))

	// Nothing was saved.
	assert.Empty(t, f.store.answers[reg.ID])
}

func TestPhotoAnswerIsStoredEncryptedAndNeverReturned(t *testing.T) {
	f := newRegFixture(t)
	sec := infrastructure.InitSecurityService(testKey, testKey)
	f.uc.Security = sec
	reg, actor := f.start(t)
	ctx := context.Background()

	photo := "data:image/png;base64," + base64.StdEncoding.EncodeToString([]byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"))
	body, _ := json.Marshal(map[string]string{"name": "id.png", "data": photo})

	saved := f.save(t, actor, reg.ID, "id_upload", string(body))
	assert.JSONEq(t, `{"name":"id.png"}`, string(saved.Value), "the answer to the device is the name only")

	// In the database the photo is ciphertext, and only the right learner and step open it.
	stored := f.store.answers[reg.ID]["id_upload"].Value
	assert.NotContains(t, string(stored), "base64")
	var sealed sealedFile
	require.NoError(t, json.Unmarshal(stored, &sealed))
	plain, err := sec.Decrypt(sealed.Nonce, sealed.Ciphertext, reg.LearnerID.String()+":id_upload")
	require.NoError(t, err)
	assert.Equal(t, photo, string(plain))
	_, err = sec.Decrypt(sealed.Nonce, sealed.Ciphertext, uuid.NewString()+":id_upload")
	assert.Error(t, err)

	// Reading the registration, and a version conflict, also give the name only.
	view, err := f.uc.Get(ctx, actor, reg.ID)
	require.NoError(t, err)
	assert.JSONEq(t, `{"name":"id.png"}`, string(view.Answers[0].Value))
	_, err = f.uc.SaveAnswer(ctx, actor, reg.ID, "id_upload", body, "typed", 0)
	var conflict *domain.ConflictError
	require.ErrorAs(t, err, &conflict)
	assert.JSONEq(t, `{"name":"id.png"}`, string(conflict.Current.Value))

	// The photo can be removed.
	cleared := f.save(t, actor, reg.ID, "id_upload", `""`)
	assert.JSONEq(t, `""`, string(cleared.Value))
}

func TestSaveAnswerStoresCleanValues(t *testing.T) {
	f := newRegFixture(t)
	reg, actor := f.start(t)

	phone := f.save(t, actor, reg.ID, "phone", `"0912 345 678"`)
	assert.JSONEq(t, `"+251912345678"`, string(phone.Value))

	name := f.save(t, actor, reg.ID, "full_name", `"  Abebe Kebede  "`)
	assert.JSONEq(t, `"Abebe Kebede"`, string(name.Value))

	partner := f.save(t, actor, reg.ID, "referral_partner", `"`+aaapdPartnerID.String()+`"`)
	assert.JSONEq(t, `"`+aaapdPartnerID.String()+`"`, string(partner.Value))

	// An optional answer can be cleared.
	cleared := f.save(t, actor, reg.ID, "id_last4", `""`)
	assert.JSONEq(t, `""`, string(cleared.Value))
}

func TestUpdateProgress(t *testing.T) {
	f := newRegFixture(t)
	reg, actor := f.start(t)
	ctx := context.Background()

	step, lang, simple := "full_name", "en", true
	require.NoError(t, f.uc.UpdateProgress(ctx, actor, reg.ID, &step, &lang, &simple))
	assert.Equal(t, "full_name", f.store.regs[reg.ID].CurrentStep)
	assert.Equal(t, "en", f.store.learners[reg.LearnerID].Language)
	assert.True(t, f.store.learners[reg.LearnerID].SimpleMode)

	// Only what is sent changes.
	require.NoError(t, f.uc.UpdateProgress(ctx, actor, reg.ID, nil, nil, nil))
	assert.Equal(t, "en", f.store.learners[reg.LearnerID].Language)

	bad := "not_a_step"
	err := f.uc.UpdateProgress(ctx, actor, reg.ID, &bad, nil, nil)
	assert.Equal(t, map[string]string{"current_step": "unknown_step"}, fieldCodes(t, err))
}

func TestSubmitListsMissingRequiredAnswers(t *testing.T) {
	f := newRegFixture(t)
	reg, actor := f.start(t)

	_, err := f.uc.Submit(context.Background(), actor, reg.ID)
	assert.Equal(t, map[string]string{"full_name": "required", "contact_method": "required", "id_route": "required"}, fieldCodes(t, err))

	// Choosing phone contact puts the phone step on the path, so it becomes required too.
	f.save(t, actor, reg.ID, "full_name", `"Abebe Kebede"`)
	f.save(t, actor, reg.ID, "contact_method", `"phone"`)
	f.save(t, actor, reg.ID, "id_route", `"fayda"`)
	_, err = f.uc.Submit(context.Background(), actor, reg.ID)
	assert.Equal(t, map[string]string{"phone": "required"}, fieldCodes(t, err))
	assert.Equal(t, domain.RegistrationStatusDraft, f.store.regs[reg.ID].Status)
}

func TestSubmitFillsTheLearnerAndIdentityEvidence(t *testing.T) {
	f := newRegFixture(t)
	reg, actor := f.start(t)
	f.save(t, actor, reg.ID, "full_name", `"Abebe Kebede"`)
	f.save(t, actor, reg.ID, "contact_method", `"phone"`)
	f.save(t, actor, reg.ID, "phone", `"+251 91 234 5678"`)
	f.save(t, actor, reg.ID, "dob", `{"calendar":"ethiopian","ethiopian":{"year":2010,"month":1,"day":15},"iso":"2017-09-25"}`)
	f.save(t, actor, reg.ID, "id_route", `"fayda"`)
	f.save(t, actor, reg.ID, "id_last4", `"4821"`)

	res, err := f.uc.Submit(context.Background(), actor, reg.ID)
	require.NoError(t, err)

	assert.Equal(t, domain.LearnerStatusRegistered, res.Learner.Status)
	assert.Equal(t, domain.IdentitySelfDeclared, res.Learner.IdentityLevel)
	assert.Equal(t, "Abebe Kebede", res.Learner.FullName)
	assert.Equal(t, "+251912345678", res.Learner.PhoneE164)
	require.NotNil(t, res.Learner.DOB)
	assert.Equal(t, "2017-09-25", res.Learner.DOB.Format("2006-01-02"))
	assert.Equal(t, "ethiopian", res.Learner.DOBCalendar)
	assert.Nil(t, res.Referral)

	require.Len(t, f.store.evidence, 1)
	assert.Equal(t, "fayda", f.store.evidence[0].Route)
	assert.Equal(t, "4821", f.store.evidence[0].Last4)
	assert.Equal(t, domain.RegistrationStatusSubmitted, f.store.regs[reg.ID].Status)

	// A submitted registration can't change any more.
	_, err = f.uc.SaveAnswer(context.Background(), actor, reg.ID, "full_name", json.RawMessage(`"Someone else"`), "typed", 1)
	assert.ErrorIs(t, err, domain.ErrAlreadySubmitted)
}

func TestSubmitReferMeRouteCreatesAReferral(t *testing.T) {
	f := newRegFixture(t)
	reg, actor := f.start(t)
	f.save(t, actor, reg.ID, "full_name", `"Abebe Kebede"`)
	f.save(t, actor, reg.ID, "contact_method", `"partner"`)
	f.save(t, actor, reg.ID, "id_route", `"none"`)

	_, err := f.uc.Submit(context.Background(), actor, reg.ID)
	assert.Equal(t, map[string]string{"referral_partner": "required", "referral_contact": "required"}, fieldCodes(t, err))

	f.save(t, actor, reg.ID, "referral_partner", `"`+aaapdPartnerID.String()+`"`)
	f.save(t, actor, reg.ID, "referral_contact", `"in_person"`)
	res, err := f.uc.Submit(context.Background(), actor, reg.ID)
	require.NoError(t, err)

	require.NotNil(t, res.Referral)
	assert.Equal(t, aaapdPartnerID, res.Referral.PartnerID)
	assert.Equal(t, "in_person", res.Referral.ContactPreference)
	assert.Equal(t, domain.ReferralStatusRequested, res.Referral.Status)
	assert.Equal(t, "AAAPD", res.ReferralPartnerName)
	assert.Equal(t, "none", f.store.evidence[0].Route)
}

func TestSubmitIgnoresAnswersOffThePath(t *testing.T) {
	f := newRegFixture(t)
	reg, actor := f.start(t)
	f.save(t, actor, reg.ID, "full_name", `"Abebe Kebede"`)
	f.save(t, actor, reg.ID, "contact_method", `"phone"`)
	f.save(t, actor, reg.ID, "phone", `"0912345678"`)
	f.save(t, actor, reg.ID, "contact_method", `"none"`) // changed their mind: no phone step any more
	f.save(t, actor, reg.ID, "id_route", `"other_document"`)
	f.save(t, actor, reg.ID, "id_doc_type", `"student_id"`)

	res, err := f.uc.Submit(context.Background(), actor, reg.ID)
	require.NoError(t, err)
	assert.Equal(t, "none", res.Learner.ContactMethod)
	assert.Empty(t, res.Learner.PhoneE164)
	assert.Equal(t, "student_id", f.store.evidence[0].DocType)
}

func TestSubmitTwiceReturnsTheSameResult(t *testing.T) {
	f := newRegFixture(t)
	reg, actor := f.start(t)
	f.save(t, actor, reg.ID, "full_name", `"Abebe Kebede"`)
	f.save(t, actor, reg.ID, "contact_method", `"none"`)
	f.save(t, actor, reg.ID, "id_route", `"none"`)
	f.save(t, actor, reg.ID, "referral_partner", `"`+aaapdPartnerID.String()+`"`)
	f.save(t, actor, reg.ID, "referral_contact", `"phone"`)

	first, err := f.uc.Submit(context.Background(), actor, reg.ID)
	require.NoError(t, err)
	again, err := f.uc.Submit(context.Background(), actor, reg.ID)
	require.NoError(t, err)

	assert.Equal(t, first.Learner.ID, again.Learner.ID)
	assert.Equal(t, first.Referral.ID, again.Referral.ID)
	assert.Equal(t, "AAAPD", again.ReferralPartnerName)
	assert.Len(t, f.store.evidence, 1, "no second evidence row")
	assert.Len(t, f.store.referrals, 1, "no second referral")
}
