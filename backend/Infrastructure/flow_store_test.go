package infrastructure

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	domain "bridge/Domain"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	sharedFlows = "../../shared/flows"
	sharedNeeds = "../../shared/vocab/needs.json"
)

// The real shared files must load: this fails if the frontend team changes them in a way
// the API can't read.
func TestLoadsTheSharedFlowFiles(t *testing.T) {
	s, err := LoadFlowStore(sharedFlows, sharedNeeds)
	require.NoError(t, err)

	for _, id := range []string{"signup", "job-application", "employer-job"} {
		f, ok := s.Flow(id, 0)
		require.True(t, ok, id)
		assert.Equal(t, 1, f.Version)
	}

	signup, _ := s.Flow("signup", 1)
	assert.Equal(t, "welcome", signup.Start)

	phone, ok := s.Step("signup", 1, "phone")
	require.True(t, ok)
	assert.Equal(t, domain.StepPhone, phone.Type)
	assert.Equal(t, domain.StorageAnswer, phone.Storage)
	assert.True(t, phone.Required)
	assert.Equal(t, []domain.FlowRule{{Name: domain.RulePhoneET, Error: "phone_invalid"}}, phone.Rules)

	idRoute, _ := s.Step("signup", 1, "id_route")
	assert.Contains(t, idRoute.Options, "none")
	assert.Len(t, idRoute.Next, 3)
	assert.Equal(t, &domain.FlowCondition{Step: "id_route", Equals: "none"}, idRoute.Next[0].When)

	_, ok = s.Flow("signup", 2)
	assert.False(t, ok)
	_, ok = s.Step("signup", 1, "nope")
	assert.False(t, ok)

	assert.Len(t, s.NeedCodes(), 14)
	assert.True(t, s.IsNeedCode("screen_reader"))
	assert.False(t, s.IsNeedCode("jetpack"))
}

func TestFlowPathFollowsTheAnswers(t *testing.T) {
	s, err := LoadFlowStore(sharedFlows, sharedNeeds)
	require.NoError(t, err)
	signup, _ := s.Flow("signup", 0)

	ids := func(answers map[string]string) []string {
		raw := map[string]json.RawMessage{}
		for k, v := range answers {
			b, _ := json.Marshal(v)
			raw[k] = b
		}
		var out []string
		for _, step := range signup.Path(raw) {
			out = append(out, step.ID)
		}
		return out
	}

	assert.Equal(t, []string{
		"welcome", "consent_data", "full_name", "contact_method", "phone", "dob", "sex", "region", "education", "id_route",
		"id_doc_type", "id_upload", "id_last4", "support_needs", "support_other", "support_share", "check", "done",
	}, ids(map[string]string{"contact_method": "telegram", "id_route": "other_document"}))

	// A document without a number skips the last-4 question but still offers the upload.
	assert.Equal(t, []string{
		"welcome", "consent_data", "full_name", "contact_method", "dob", "sex", "region", "education", "id_route",
		"id_doc_type", "id_upload", "support_needs", "support_other", "support_share", "check", "done",
	}, ids(map[string]string{"contact_method": "none", "id_route": "other_document", "id_doc_type": "kebele_letter"}))

	assert.Equal(t, []string{
		"welcome", "consent_data", "full_name", "contact_method", "dob", "sex", "region", "education", "id_route",
		"referral_partner", "referral_contact", "support_needs", "support_other", "support_share", "check", "done",
	}, ids(map[string]string{"contact_method": "none", "id_route": "none"}))
}

func writeFile(t *testing.T, dir, name, content string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	require.NoError(t, os.WriteFile(p, []byte(content), 0o644))
	return p
}

func TestBrokenFlowFilesStopTheServer(t *testing.T) {
	cases := map[string]string{
		"bad JSON":               `{"id": "x"`,
		"unknown type":           `{"id":"x","version":1,"start":"a","steps":[{"id":"a","type":"slider"}]}`,
		"unknown rule":           `{"id":"x","version":1,"start":"a","steps":[{"id":"a","type":"text","validate":[{"rule":"is_nice","error":"e"}]}]}`,
		"no error code":          `{"id":"x","version":1,"start":"a","steps":[{"id":"a","type":"text","validate":[{"rule":"min_length","value":2}]}]}`,
		"broken next":            `{"id":"x","version":1,"start":"a","steps":[{"id":"a","type":"info","next":"b"}]}`,
		"missing start":          `{"id":"x","version":1,"start":"z","steps":[{"id":"a","type":"info"}]}`,
		"duplicate step":         `{"id":"x","version":1,"start":"a","steps":[{"id":"a","type":"info"},{"id":"a","type":"info"}]}`,
		"bad condition":          `{"id":"x","version":1,"start":"a","steps":[{"id":"a","type":"single_choice","options":[{"value":"y"}],"next":[{"when":{"step":"a"},"goto":"a"}]}]}`,
		"choice without options": `{"id":"x","version":1,"start":"a","steps":[{"id":"a","type":"single_choice"}]}`,
	}
	for name, content := range cases {
		dir := t.TempDir()
		writeFile(t, dir, "flow.json", content)
		_, err := LoadFlowStore(dir, sharedNeeds)
		assert.Error(t, err, name)
	}

	_, err := LoadFlowStore(t.TempDir(), sharedNeeds)
	assert.Error(t, err, "no flow files")
	_, err = LoadFlowStore(sharedFlows, "missing.json")
	assert.Error(t, err, "no needs file")
}

func TestLatestVersionIsTheDefault(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "v1.json", `{"id":"x","version":1,"start":"a","steps":[{"id":"a","type":"done"}]}`)
	writeFile(t, dir, "v2.json", `{"id":"x","version":2,"start":"b","steps":[{"id":"b","type":"done"}]}`)
	s, err := LoadFlowStore(dir, sharedNeeds)
	require.NoError(t, err)
	f, ok := s.Flow("x", 0)
	require.True(t, ok)
	assert.Equal(t, 2, f.Version)

	writeFile(t, dir, "v2-copy.json", `{"id":"x","version":2,"start":"b","steps":[{"id":"b","type":"done"}]}`)
	_, err = LoadFlowStore(dir, sharedNeeds)
	assert.Error(t, err, "the same version twice")
}
