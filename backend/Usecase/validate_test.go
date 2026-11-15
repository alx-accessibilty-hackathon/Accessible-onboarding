package usecase

import (
	"encoding/base64"
	"encoding/json"
	"testing"

	domain "bridge/Domain"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeEthiopianPhone(t *testing.T) {
	valid := map[string]string{
		"0912345678":        "+251912345678",
		"0912 345 678":      "+251912345678",
		"912345678":         "+251912345678",
		"+251912345678":     "+251912345678",
		"+251 91 234 5678":  "+251912345678",
		"+251-91-234-5678":  "+251912345678",
		"251912345678":      "+251912345678",
		"00251912345678":    "+251912345678",
		"+251 0912 345 678": "+251912345678", // with the trunk 0 after the country code
		"(091) 234-5678":    "+251912345678",
		"0712345678":        "+251712345678", // Safaricom Ethiopia
		"  0912345678  ":    "+251912345678",
	}
	for in, want := range valid {
		got, ok := normalizeEthiopianPhone(in)
		assert.True(t, ok, in)
		assert.Equal(t, want, got, in)
	}

	invalid := []string{
		"", "12345", "0812345678", "0112345678", // landline / wrong prefix
		"09123456789", "091234567", // too long / too short
		"+44 7700 900123", "+2519123456789", "abc", "091234567x", "09+12345678",
	}
	for _, in := range invalid {
		_, ok := normalizeEthiopianPhone(in)
		assert.False(t, ok, in)
	}
}

func TestEthiopianToGregorian(t *testing.T) {
	cases := []struct {
		y, m, d int
		want    string
	}{
		{2016, 1, 1, "2023-09-12"},  // 1 Meskerem 2016
		{2019, 3, 5, "2026-11-14"},  // 5 Hidar 2019
		{2019, 4, 29, "2027-01-07"}, // 29 Tahsas 2019 (Ethiopian Christmas)
		{2015, 13, 6, "2023-09-11"}, // 6 Pagume 2015: 2015 is a leap year
		{2010, 1, 15, "2017-09-25"}, // the example in TECHNICAL_PLAN.md 2.3
		{2017, 1, 1, "2024-09-11"},
	}
	for _, c := range cases {
		got, ok := ethiopianToGregorian(c.y, c.m, c.d)
		require.True(t, ok)
		assert.Equal(t, c.want, got.Format("2006-01-02"), "%d-%d-%d", c.y, c.m, c.d)
	}

	for _, bad := range [][3]int{{2016, 13, 6}, {2015, 13, 7}, {2016, 14, 1}, {2016, 0, 1}, {2016, 1, 31}, {0, 1, 1}} {
		_, ok := ethiopianToGregorian(bad[0], bad[1], bad[2])
		assert.False(t, ok, "%v", bad)
	}
}

func dateStep() *domain.FlowStep {
	return &domain.FlowStep{ID: "dob", Type: domain.StepDate, Rules: []domain.FlowRule{{Name: domain.RuleDateValid, Error: "date_invalid"}}}
}

func TestValidateDate(t *testing.T) {
	ok := map[string]string{
		`{"calendar":"ethiopian","ethiopian":{"year":2010,"month":1,"day":15},"iso":"2017-09-25"}`: `{"calendar":"ethiopian","ethiopian":{"year":2010,"month":1,"day":15},"iso":"2017-09-25"}`,
		`{"calendar":"gregorian","iso":"2001-02-03","extra":"dropped"}`:                            `{"calendar":"gregorian","iso":"2001-02-03"}`,
		`{"iso":"2001-02-03"}`: `{"calendar":"gregorian","iso":"2001-02-03"}`,
		`"2001-02-03"`:         `"2001-02-03"`,
	}
	for in, want := range ok {
		got, err := validateAnswer(dateStep(), json.RawMessage(in), nil)
		require.NoError(t, err, in)
		assert.JSONEq(t, want, string(got), in)
	}

	bad := []string{
		`{"calendar":"ethiopian","ethiopian":{"year":2010,"month":1,"day":15},"iso":"2017-09-26"}`, // days don't match
		`{"calendar":"ethiopian","iso":"2017-09-25"}`,                                              // Ethiopian part missing
		`{"calendar":"julian","iso":"2017-09-25"}`,
		`{"calendar":"gregorian","iso":"2010-02-30"}`,
		`{"calendar":"gregorian","iso":"1850-01-01"}`,
		`"25/09/2017"`, `42`, `{}`,
	}
	for _, in := range bad {
		_, err := validateAnswer(dateStep(), json.RawMessage(in), nil)
		assert.Equal(t, map[string]string{"value": "date_invalid"}, fieldCodes(t, err), in)
	}
}

func TestValidateTextCountsCharactersNotBytes(t *testing.T) {
	step := &domain.FlowStep{ID: "full_name", Type: domain.StepText, Required: true, Rules: []domain.FlowRule{
		{Name: domain.RuleMinLength, Number: 2, Error: "too_short"},
		{Name: domain.RuleMaxLength, Number: 4, Error: "too_long"},
	}}
	_, err := validateAnswer(step, json.RawMessage(`"አበ"`), nil) // 2 characters, 6 bytes
	assert.NoError(t, err)
	_, err = validateAnswer(step, json.RawMessage(`"አ"`), nil)
	assert.Equal(t, map[string]string{"value": "too_short"}, fieldCodes(t, err))
	_, err = validateAnswer(step, json.RawMessage(`"አበበከበ"`), nil)
	assert.Equal(t, map[string]string{"value": "too_long"}, fieldCodes(t, err))
	_, err = validateAnswer(step, json.RawMessage(`123`), nil)
	assert.Equal(t, map[string]string{"value": "invalid"}, fieldCodes(t, err))
}

func TestValidateFile(t *testing.T) {
	step := &domain.FlowStep{ID: "id_upload", Type: domain.StepFile}
	png := []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
	dataURL := func(mime string, b []byte) string {
		return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(b)
	}
	body := func(name, data string) json.RawMessage {
		b, _ := json.Marshal(fileAnswer{Name: name, Data: data})
		return b
	}

	got, err := validateAnswer(step, body(" id.png ", dataURL("image/png", png)), nil)
	require.NoError(t, err)
	assert.JSONEq(t, string(body("id.png", dataURL("image/png", png))), string(got))

	bad := map[string]json.RawMessage{
		"not an object":     json.RawMessage(`"hello"`),
		"not a data URL":    body("a.png", "https://example.com/a.png"),
		"not an image type": body("a.pdf", dataURL("application/pdf", png)),
		"label lies":        body("a.jpg", dataURL("image/jpeg", png)),
		"bad base64":        body("a.png", "data:image/png;base64,***"),
		"empty file":        body("a.png", "data:image/png;base64,"),
	}
	for name, in := range bad {
		_, err := validateAnswer(step, in, nil)
		assert.Equal(t, map[string]string{"value": codeFileInvalid}, fieldCodes(t, err), name)
	}

	big := append(append([]byte{}, png...), make([]byte, maxFileBytes)...)
	_, err = validateAnswer(step, body("big.png", dataURL("image/png", big)), nil)
	assert.Equal(t, map[string]string{"value": codeFileTooLarge}, fieldCodes(t, err))

	got, err = validateAnswer(step, json.RawMessage(`""`), nil)
	require.NoError(t, err, "an optional photo can be cleared")
	assert.JSONEq(t, `""`, string(got))
}

func TestValidateDigits(t *testing.T) {
	step := &domain.FlowStep{ID: "id_last4", Type: domain.StepDigits, Rules: []domain.FlowRule{{Name: domain.RuleDigits, Number: 4, Error: "digits_invalid"}}}
	got, err := validateAnswer(step, json.RawMessage(`"12 34"`), nil)
	require.NoError(t, err)
	assert.JSONEq(t, `"1234"`, string(got))
	got, err = validateAnswer(step, json.RawMessage(`"0042"`), nil)
	require.NoError(t, err)
	assert.JSONEq(t, `"0042"`, string(got), "leading zeros are kept")

	for _, in := range []string{`"123"`, `"12345"`, `"12a4"`, `1234`} {
		_, err := validateAnswer(step, json.RawMessage(in), nil)
		assert.Equal(t, map[string]string{"value": "digits_invalid"}, fieldCodes(t, err), in)
	}
	// Optional and empty: allowed.
	got, err = validateAnswer(step, json.RawMessage(`""`), nil)
	require.NoError(t, err)
	assert.JSONEq(t, `""`, string(got))
}

func TestValidateChoices(t *testing.T) {
	single := &domain.FlowStep{ID: "contact_method", Type: domain.StepSingleChoice, Required: true, Options: []string{"phone", "none"}}
	_, err := validateAnswer(single, json.RawMessage(`"phone"`), isOneOf(single.Options))
	assert.NoError(t, err)
	_, err = validateAnswer(single, json.RawMessage(`"email"`), isOneOf(single.Options))
	assert.Equal(t, map[string]string{"value": "invalid_choice"}, fieldCodes(t, err))
	_, err = validateAnswer(single, json.RawMessage(`["phone"]`), isOneOf(single.Options))
	assert.Equal(t, map[string]string{"value": "invalid_choice"}, fieldCodes(t, err))

	multi := &domain.FlowStep{ID: "accommodations", Type: domain.StepMultiChoice, Required: true, Options: []string{"a", "b", "c"}}
	got, err := validateAnswer(multi, json.RawMessage(`["b","a","b"]`), isOneOf(multi.Options))
	require.NoError(t, err)
	assert.JSONEq(t, `["b","a"]`, string(got), "duplicates removed, order kept")
	_, err = validateAnswer(multi, json.RawMessage(`["a","z"]`), isOneOf(multi.Options))
	assert.Equal(t, map[string]string{"value": "invalid_choice"}, fieldCodes(t, err))
	_, err = validateAnswer(multi, json.RawMessage(`[]`), isOneOf(multi.Options))
	assert.Equal(t, map[string]string{"value": "required"}, fieldCodes(t, err))
}
