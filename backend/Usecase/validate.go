package usecase

import (
	"bytes"
	"encoding/json"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	domain "bridge/Domain"
)

// Answer validation: checks one answer against its flow step (TECHNICAL_PLAN.md 2.3) and
// returns the cleaned value to store, for example a phone number in E.164 form.
// Problems are reported on the field "value" with the step's error code, as the frontend
// expects: { "errors": [{ "field": "value", "code": "phone_invalid" }] }.

const (
	valueField   = "value"
	maxTextRunes = 5000 // hard limit for any text answer, whatever the flow says
	maxChoices   = 50

	codeRequired      = "required"
	codeInvalid       = "invalid"
	codeInvalidChoice = "invalid_choice"
	codeTooLong       = "too_long"
	codePhoneInvalid  = "phone_invalid"
	codeDateInvalid   = "date_invalid"
	codeDigitsInvalid = "digits_invalid"
)

// validateAnswer checks raw against step. isOption says whether a value is one of a choice
// step's options (it is nil for other step types).
func validateAnswer(step *domain.FlowStep, raw json.RawMessage, isOption func(string) bool) (json.RawMessage, error) {
	raw = bytes.TrimSpace(raw)
	if empty, normalized := emptyValue(raw); empty {
		if step.Required {
			return nil, invalidValue(codeRequired)
		}
		return normalized, nil // an optional answer can be cleared
	}

	switch step.Type {
	case domain.StepText, domain.StepLongText:
		return validateText(step, raw)
	case domain.StepPhone:
		return validatePhone(step, raw)
	case domain.StepDate:
		return validateDate(step, raw)
	case domain.StepDigits:
		return validateDigits(step, raw)
	case domain.StepSingleChoice:
		return validateSingleChoice(raw, isOption)
	case domain.StepMultiChoice:
		return validateMultiChoice(raw, isOption)
	default:
		return nil, invalidValue(codeInvalid) // info, consent, check_answers and done have no answer
	}
}

func invalidValue(code string) error {
	return domain.NewValidationError(valueField, code)
}

// emptyValue reports whether raw is an empty answer (null, a blank string or an empty list)
// and returns its normalized form.
func emptyValue(raw json.RawMessage) (bool, json.RawMessage) {
	if len(raw) == 0 || string(raw) == "null" {
		return true, json.RawMessage("null")
	}
	var s string
	if json.Unmarshal(raw, &s) == nil && strings.TrimSpace(s) == "" {
		return true, json.RawMessage(`""`)
	}
	var list []json.RawMessage
	if json.Unmarshal(raw, &list) == nil && len(list) == 0 {
		return true, json.RawMessage("[]")
	}
	return false, nil
}

func hasRule(step *domain.FlowStep, name string) bool {
	for _, r := range step.Rules {
		if r.Name == name {
			return true
		}
	}
	return false
}

// ruleError returns the error code of the step's rule called name, or fallback if the step
// has no such rule.
func ruleError(step *domain.FlowStep, name, fallback string) string {
	for _, r := range step.Rules {
		if r.Name == name {
			return r.Error
		}
	}
	return fallback
}

// checkTextRules applies min_length, max_length and pattern. Lengths count characters
// (runes), not bytes: "አበበ" is 3 characters.
func checkTextRules(step *domain.FlowStep, s string) error {
	n := utf8.RuneCountInString(s)
	if n > maxTextRunes {
		return invalidValue(codeTooLong)
	}
	for _, r := range step.Rules {
		switch r.Name {
		case domain.RuleMinLength:
			if n < r.Number {
				return invalidValue(r.Error)
			}
		case domain.RuleMaxLength:
			if n > r.Number {
				return invalidValue(r.Error)
			}
		case domain.RulePattern:
			re, err := regexp.Compile(r.Text) // checked when the flow was loaded
			if err != nil || !re.MatchString(s) {
				return invalidValue(r.Error)
			}
		}
	}
	return nil
}

func validateText(step *domain.FlowStep, raw json.RawMessage) (json.RawMessage, error) {
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, invalidValue(codeInvalid)
	}
	s = strings.TrimSpace(s)
	if err := checkTextRules(step, s); err != nil {
		return nil, err
	}
	return json.Marshal(s)
}

func validatePhone(step *domain.FlowStep, raw json.RawMessage) (json.RawMessage, error) {
	code := ruleError(step, domain.RulePhoneET, codePhoneInvalid)
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, invalidValue(code)
	}
	normalize := normalizeAnyPhone
	if hasRule(step, domain.RulePhoneET) {
		normalize = normalizeEthiopianPhone
	}
	phone, ok := normalize(s)
	if !ok {
		return nil, invalidValue(code)
	}
	return json.Marshal(phone)
}

// normalizeEthiopianPhone turns the ways people write an Ethiopian mobile number into
// E.164: "0912 345 678", "912345678", "+251-91-234-5678", "00251912345678" and
// "+251 0912 345 678" all become "+251912345678". Mobile numbers start with 9
// (Ethio Telecom) or 7 (Safaricom Ethiopia) after the country code.
func normalizeEthiopianPhone(s string) (string, bool) {
	d, ok := phoneDigits(s)
	if !ok {
		return "", false
	}
	switch {
	case strings.HasPrefix(d, "+251"):
		d = d[4:]
	case strings.HasPrefix(d, "00251"):
		d = d[5:]
	case strings.HasPrefix(d, "251") && len(d) >= 12:
		d = d[3:]
	}
	if len(d) == 10 && d[0] == '0' { // the trunk "0" of a national number
		d = d[1:]
	}
	if len(d) != 9 || (d[0] != '9' && d[0] != '7') || strings.ContainsRune(d, '+') {
		return "", false
	}
	return "+251" + d, true
}

// normalizeAnyPhone is used when a phone step has no phone_et rule: 7 to 15 digits,
// optionally starting with "+".
func normalizeAnyPhone(s string) (string, bool) {
	d, ok := phoneDigits(s)
	digits := strings.TrimPrefix(d, "+")
	if !ok || len(digits) < 7 || len(digits) > 15 || strings.ContainsRune(digits, '+') {
		return "", false
	}
	return d, true
}

// phoneDigits keeps the digits and a leading "+", dropping spaces, dashes, dots and brackets.
func phoneDigits(s string) (string, bool) {
	var b strings.Builder
	for _, r := range strings.TrimSpace(s) {
		switch {
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '+' && b.Len() == 0:
			b.WriteRune(r)
		case r == ' ' || r == '-' || r == '.' || r == '(' || r == ')':
			// separator
		default:
			return "", false
		}
	}
	return b.String(), b.Len() > 0
}

func validateDigits(step *domain.FlowStep, raw json.RawMessage) (json.RawMessage, error) {
	code := ruleError(step, domain.RuleDigits, codeDigitsInvalid)
	var s string
	if err := json.Unmarshal(raw, &s); err != nil { // a string, so leading zeros survive
		return nil, invalidValue(code)
	}
	s = strings.Join(strings.Fields(s), "") // "12 34" → "1234"
	for _, r := range s {
		if r < '0' || r > '9' {
			return nil, invalidValue(code)
		}
	}
	for _, r := range step.Rules {
		if r.Name == domain.RuleDigits && len(s) != r.Number {
			return nil, invalidValue(r.Error)
		}
	}
	if err := checkTextRules(step, s); err != nil {
		return nil, err
	}
	return json.Marshal(s)
}

func validateSingleChoice(raw json.RawMessage, isOption func(string) bool) (json.RawMessage, error) {
	var s string
	if err := json.Unmarshal(raw, &s); err != nil || isOption == nil || !isOption(s) {
		return nil, invalidValue(codeInvalidChoice)
	}
	return json.Marshal(s)
}

func validateMultiChoice(raw json.RawMessage, isOption func(string) bool) (json.RawMessage, error) {
	var list []string
	if err := json.Unmarshal(raw, &list); err != nil || isOption == nil || len(list) > maxChoices {
		return nil, invalidValue(codeInvalidChoice)
	}
	clean := make([]string, 0, len(list))
	seen := make(map[string]bool, len(list))
	for _, v := range list {
		if !isOption(v) {
			return nil, invalidValue(codeInvalidChoice)
		}
		if !seen[v] {
			seen[v] = true
			clean = append(clean, v)
		}
	}
	return json.Marshal(clean)
}

// ---- dates ----

// dateAnswer is the date value agreed with the frontend (TECHNICAL_PLAN.md 2.3):
//
//	{ "calendar": "ethiopian", "ethiopian": { "year": 2010, "month": 1, "day": 15 }, "iso": "2017-09-25" }
//
// A plain "2017-09-25" string is accepted too (Gregorian).
type dateAnswer struct {
	Calendar  string        `json:"calendar"`
	Ethiopian *ethiopianDay `json:"ethiopian,omitempty"`
	ISO       string        `json:"iso"`
}

type ethiopianDay struct {
	Year  int `json:"year"`
	Month int `json:"month"`
	Day   int `json:"day"`
}

const (
	calendarEthiopian = "ethiopian"
	calendarGregorian = "gregorian"
	minDateYear       = 1900
	maxDateYear       = 2100
)

func validateDate(step *domain.FlowStep, raw json.RawMessage) (json.RawMessage, error) {
	code := ruleError(step, domain.RuleDateValid, codeDateInvalid)

	var iso string
	if json.Unmarshal(raw, &iso) == nil {
		if _, ok := parseISODate(iso); !ok {
			return nil, invalidValue(code)
		}
		return json.Marshal(iso)
	}

	var in dateInput
	if err := json.Unmarshal(raw, &in); err != nil {
		return nil, invalidValue(code)
	}
	d := in.dateAnswer
	if d.ISO == "" {
		// No ISO date: work it out from the Ethiopian part or the flat year/month/day.
		iso, eth, ok := in.isoFromParts()
		if !ok {
			return nil, invalidValue(code)
		}
		d.ISO, d.Ethiopian = iso, eth
	}
	day, ok := parseISODate(d.ISO)
	if !ok {
		return nil, invalidValue(code)
	}
	if d.Calendar == "" {
		d.Calendar = calendarGregorian
		if d.Ethiopian != nil {
			d.Calendar = calendarEthiopian
		}
	}
	switch d.Calendar {
	case calendarGregorian:
	case calendarEthiopian:
		if d.Ethiopian == nil {
			return nil, invalidValue(code)
		}
	default:
		return nil, invalidValue(code)
	}
	// The Ethiopian date the learner picked must be the same day as the ISO date.
	if d.Ethiopian != nil {
		g, ok := ethiopianToGregorian(d.Ethiopian.Year, d.Ethiopian.Month, d.Ethiopian.Day)
		if !ok || !g.Equal(day) {
			return nil, invalidValue(code)
		}
	}
	return json.Marshal(d)
}

// dateInput is what a client may send for a date: the canonical dateAnswer, or, without
// "iso", a flat { "calendar": "ethiopian" | "gregorian", "year", "month", "day" }. Only the
// canonical form { calendar, ethiopian?, iso } is stored.
type dateInput struct {
	dateAnswer
	Year  int `json:"year"`
	Month int `json:"month"`
	Day   int `json:"day"`
}

// isoFromParts computes the ISO date when the client sent none: from the Ethiopian part, or
// from the flat year/month/day in the given calendar (Gregorian if none). It also returns the
// Ethiopian part to store, if any.
func (in dateInput) isoFromParts() (string, *ethiopianDay, bool) {
	eth := in.Ethiopian
	if eth == nil && in.Calendar == calendarEthiopian && in.Year != 0 {
		eth = &ethiopianDay{Year: in.Year, Month: in.Month, Day: in.Day}
	}
	if eth != nil {
		g, ok := ethiopianToGregorian(eth.Year, eth.Month, eth.Day)
		if !ok {
			return "", nil, false
		}
		return g.Format("2006-01-02"), eth, true
	}
	if in.Year == 0 || (in.Calendar != "" && in.Calendar != calendarGregorian) {
		return "", nil, false
	}
	t := time.Date(in.Year, time.Month(in.Month), in.Day, 0, 0, 0, 0, time.UTC)
	if in.Month < 1 || in.Month > 12 || t.Year() != in.Year || int(t.Month()) != in.Month || t.Day() != in.Day {
		return "", nil, false // e.g. 30 February
	}
	return t.Format("2006-01-02"), nil, true
}

// parseISODate reads "YYYY-MM-DD" (a real Gregorian date between 1900 and 2100) as midnight UTC.
func parseISODate(s string) (time.Time, bool) {
	t, err := time.Parse("2006-01-02", s)
	if err != nil || t.Year() < minDateYear || t.Year() > maxDateYear {
		return time.Time{}, false
	}
	return t, true
}

// ethiopianToGregorian converts an Ethiopian calendar date to the Gregorian day (midnight UTC).
// The Ethiopian year has 12 months of 30 days and a 13th month (Pagume) of 5 days, or 6 in a
// leap year (year % 4 == 3). Day numbers are counted from the Ethiopian epoch, Julian Day
// Number 1724221 (1 Meskerem year 1).
func ethiopianToGregorian(year, month, day int) (time.Time, bool) {
	if year < 1 || month < 1 || month > 13 || day < 1 || day > 30 {
		return time.Time{}, false
	}
	if month == 13 {
		pagume := 5
		if year%4 == 3 {
			pagume = 6
		}
		if day > pagume {
			return time.Time{}, false
		}
	}
	const ethiopianEpochJDN = 1724221
	const unixEpochJDN = 2440588 // 1970-01-01
	jdn := ethiopianEpochJDN + 365*(year-1) + year/4 + 30*(month-1) + day - 1
	return time.Unix(0, 0).UTC().AddDate(0, 0, jdn-unixEpochJDN), true
}

// ---- reading stored answers (on submit) ----

// answerString returns a stored string answer, or "" for null, a missing or a non-string answer.
func answerString(raw json.RawMessage) string {
	var s string
	if len(raw) == 0 || json.Unmarshal(raw, &s) != nil {
		return ""
	}
	return strings.TrimSpace(s)
}

// answerDate returns a stored date answer and its calendar.
func answerDate(raw json.RawMessage) (*time.Time, string) {
	if len(raw) == 0 {
		return nil, ""
	}
	var iso string
	if json.Unmarshal(raw, &iso) == nil {
		if t, ok := parseISODate(iso); ok {
			return &t, calendarGregorian
		}
		return nil, ""
	}
	var d dateAnswer
	if json.Unmarshal(raw, &d) != nil {
		return nil, ""
	}
	t, ok := parseISODate(d.ISO)
	if !ok {
		return nil, ""
	}
	if d.Calendar != calendarEthiopian {
		d.Calendar = calendarGregorian
	}
	return &t, d.Calendar
}
