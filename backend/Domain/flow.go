package domain

import "encoding/json"

// A Flow is a form described as a list of steps (shared/flows/*.json, TECHNICAL_PLAN.md 2.3).
// The widget draws one step per screen; the API reads the same file to know which answers
// exist, which are required and how to check them. Infrastructure/flow_store.go loads the files.
type Flow struct {
	ID      string // e.g. "signup"
	Version int
	Start   string // ID of the first step
	Steps   []FlowStep
}

// FlowStep is one screen of a flow. Labels, icons and hints are frontend concerns and are
// not kept here.
type FlowStep struct {
	ID          string // also the answer key, e.g. "phone"
	Type        string // StepText, StepPhone, …
	Required    bool
	Storage     string     // StorageAnswer, StorageSupport or StorageNone ("" for info screens)
	Rules       []FlowRule // extra checks, e.g. min_length 2
	Options     []string   // allowed values for choice steps
	OptionsFrom string     // OptionsFromNeeds or OptionsFromReferralPartners, instead of Options
	Next        []FlowNext // checked in order; empty for the last step
}

// FlowRule is one entry of a step's "validate" list.
type FlowRule struct {
	Name   string // RuleMinLength, RulePhoneET, …
	Number int    // value of min_length, max_length and digits
	Text   string // value of pattern
	Error  string // error code to report, e.g. "phone_invalid"
}

// FlowNext is one "next" rule. A rule without When always matches; a plain
// "next": "dob" in the file becomes a single rule without When.
type FlowNext struct {
	When *FlowCondition
	Goto string
}

// FlowCondition compares the answer of an earlier choice step: Equals one value, or In a list.
type FlowCondition struct {
	Step   string
	Equals string
	In     []string
}

// Step types (the "type" field).
const (
	StepInfo         = "info"
	StepConsent      = "consent"
	StepText         = "text"
	StepLongText     = "long_text"
	StepPhone        = "phone"
	StepDate         = "date"
	StepDigits       = "digits"
	StepSingleChoice = "single_choice"
	StepMultiChoice  = "multi_choice"
	StepCheckAnswers = "check_answers"
	StepDone         = "done"
)

// Where a step's answer goes (the "storage" field).
const (
	StorageAnswer  = "answer"  // PUT /registrations/:id/answers/:questionId
	StorageSupport = "support" // PUT /registrations/:id/support-request (encrypted)
	StorageNone    = "none"    // stays on the device (e.g. the consent screen)
)

// Validation rules (the "validate" list).
const (
	RuleMinLength = "min_length"
	RuleMaxLength = "max_length"
	RulePattern   = "pattern"
	RuleDigits    = "digits"
	RulePhoneET   = "phone_et"
	RuleDateValid = "date_valid"
)

// Shared option lists (the "options_from" field).
const (
	OptionsFromNeeds            = "vocab:needs"
	OptionsFromReferralPartners = "config:referral_partners"
)

// Flow IDs the API knows about.
const (
	FlowSignup = "signup"
)

// Step returns the step with this ID.
func (f *Flow) Step(id string) (*FlowStep, bool) {
	for i := range f.Steps {
		if f.Steps[i].ID == id {
			return &f.Steps[i], true
		}
	}
	return nil, false
}

// Next returns the ID of the step after step, given the answers so far ("" at the end).
// Rules are checked in order. A condition on a question that has no answer yet is false,
// so unanswered branches follow the last rule.
func (f *Flow) Next(step *FlowStep, answers map[string]json.RawMessage) string {
	for _, n := range step.Next {
		if n.When == nil || n.When.matches(answers) {
			return n.Goto
		}
	}
	return ""
}

// Path walks the flow from Start, following the answers: the steps this learner actually sees.
// Answers to steps off the path (for example a phone number typed before the learner
// switched their contact method to "none") don't count.
func (f *Flow) Path(answers map[string]json.RawMessage) []*FlowStep {
	var path []*FlowStep
	seen := make(map[string]bool, len(f.Steps))
	for id := f.Start; id != "" && !seen[id]; {
		step, ok := f.Step(id)
		if !ok {
			break
		}
		seen[id] = true
		path = append(path, step)
		id = f.Next(step, answers)
	}
	return path
}

func (c *FlowCondition) matches(answers map[string]json.RawMessage) bool {
	raw, ok := answers[c.Step]
	if !ok {
		return false
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return false // only single-choice (string) answers can be compared
	}
	if c.Equals != "" {
		return value == c.Equals
	}
	for _, v := range c.In {
		if value == v {
			return true
		}
	}
	return false
}
