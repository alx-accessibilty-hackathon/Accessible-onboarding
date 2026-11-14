package infrastructure

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"

	domain "bridge/Domain"
)

// FlowStore holds every flow file from FLOWS_DIR and the needs vocabulary, loaded once at
// start-up. Loading checks the files (unknown step types, rules, broken "next" links…) so a
// mistake in a shared file stops the server instead of silently skipping a check.
type FlowStore struct {
	flows  map[string]map[int]*domain.Flow // flow ID → version → flow
	latest map[string]int                  // flow ID → highest version
	needs  []string                        // in file order
	isNeed map[string]bool
}

var _ domain.FlowStore = (*FlowStore)(nil)

// LoadFlowStore reads every *.json file in flowsDir and the needs file.
func LoadFlowStore(flowsDir, needsFile string) (*FlowStore, error) {
	s := &FlowStore{
		flows:  map[string]map[int]*domain.Flow{},
		latest: map[string]int{},
		isNeed: map[string]bool{},
	}
	if err := s.loadNeeds(needsFile); err != nil {
		return nil, err
	}

	files, err := filepath.Glob(filepath.Join(flowsDir, "*.json"))
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("no flow files in %q (check FLOWS_DIR)", flowsDir)
	}
	sort.Strings(files)
	for _, file := range files {
		flow, err := readFlowFile(file)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", filepath.Base(file), err)
		}
		if s.flows[flow.ID] == nil {
			s.flows[flow.ID] = map[int]*domain.Flow{}
		}
		if _, dup := s.flows[flow.ID][flow.Version]; dup {
			return nil, fmt.Errorf("%s: flow %q version %d is defined twice", filepath.Base(file), flow.ID, flow.Version)
		}
		s.flows[flow.ID][flow.Version] = flow
		if flow.Version > s.latest[flow.ID] {
			s.latest[flow.ID] = flow.Version
		}
	}
	return s, nil
}

func (s *FlowStore) Flow(flowID string, version int) (*domain.Flow, bool) {
	if version == 0 {
		version = s.latest[flowID]
	}
	f, ok := s.flows[flowID][version]
	return f, ok
}

func (s *FlowStore) Step(flowID string, version int, stepID string) (*domain.FlowStep, bool) {
	f, ok := s.Flow(flowID, version)
	if !ok {
		return nil, false
	}
	return f.Step(stepID)
}

func (s *FlowStore) NeedCodes() []string {
	return append([]string(nil), s.needs...) // a copy, so callers can't change the store
}

func (s *FlowStore) IsNeedCode(code string) bool {
	return s.isNeed[code]
}

// ---- reading the files ----

// The JSON shapes of the shared files. Labels, hints and icons are ignored (frontend only).
type flowFile struct {
	ID      string     `json:"id"`
	Version int        `json:"version"`
	Start   string     `json:"start"`
	Steps   []stepFile `json:"steps"`
}

type stepFile struct {
	ID          string          `json:"id"`
	Type        string          `json:"type"`
	Required    bool            `json:"required"`
	Storage     string          `json:"storage"`
	Validate    []ruleFile      `json:"validate"`
	Options     []optionFile    `json:"options"`
	OptionsFrom string          `json:"options_from"`
	Next        json.RawMessage `json:"next"` // "step_id" or [{ "when": {...}, "goto": "step_id" }]
}

type ruleFile struct {
	Rule  string          `json:"rule"`
	Value json.RawMessage `json:"value"`
	Error string          `json:"error"`
}

type optionFile struct {
	Value string `json:"value"`
}

type nextFile struct {
	When *struct {
		Step   string   `json:"step"`
		Equals string   `json:"equals"`
		In     []string `json:"in"`
	} `json:"when"`
	Goto string `json:"goto"`
}

var (
	knownStepTypes = map[string]bool{
		domain.StepInfo: true, domain.StepConsent: true, domain.StepText: true, domain.StepLongText: true,
		domain.StepPhone: true, domain.StepDate: true, domain.StepDigits: true, domain.StepSingleChoice: true,
		domain.StepMultiChoice: true, domain.StepCheckAnswers: true, domain.StepDone: true,
	}
	knownStorage     = map[string]bool{"": true, domain.StorageAnswer: true, domain.StorageSupport: true, domain.StorageNone: true}
	knownOptionsFrom = map[string]bool{"": true, domain.OptionsFromNeeds: true, domain.OptionsFromReferralPartners: true}
)

func readFlowFile(path string) (*domain.Flow, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var ff flowFile
	if err := json.Unmarshal(data, &ff); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}
	if ff.ID == "" || ff.Version < 1 || ff.Start == "" {
		return nil, fmt.Errorf("a flow needs an id, a version of 1 or more, and a start step")
	}

	flow := &domain.Flow{ID: ff.ID, Version: ff.Version, Start: ff.Start}
	for _, sf := range ff.Steps {
		step, err := toStep(sf)
		if err != nil {
			return nil, fmt.Errorf("step %q: %w", sf.ID, err)
		}
		if _, dup := flow.Step(step.ID); dup {
			return nil, fmt.Errorf("step %q is defined twice", step.ID)
		}
		flow.Steps = append(flow.Steps, step)
	}
	if err := checkLinks(flow); err != nil {
		return nil, err
	}
	return flow, nil
}

func toStep(sf stepFile) (domain.FlowStep, error) {
	step := domain.FlowStep{
		ID:          sf.ID,
		Type:        sf.Type,
		Required:    sf.Required,
		Storage:     sf.Storage,
		OptionsFrom: sf.OptionsFrom,
	}
	switch {
	case sf.ID == "":
		return step, fmt.Errorf("missing id")
	case !knownStepTypes[sf.Type]:
		return step, fmt.Errorf("unknown type %q", sf.Type)
	case !knownStorage[sf.Storage]:
		return step, fmt.Errorf("unknown storage %q", sf.Storage)
	case !knownOptionsFrom[sf.OptionsFrom]:
		return step, fmt.Errorf("unknown options_from %q", sf.OptionsFrom)
	}

	isChoice := sf.Type == domain.StepSingleChoice || sf.Type == domain.StepMultiChoice
	if isChoice && len(sf.Options) == 0 && sf.OptionsFrom == "" {
		return step, fmt.Errorf("a choice step needs options or options_from")
	}
	for _, o := range sf.Options {
		if o.Value == "" {
			return step, fmt.Errorf("an option has no value")
		}
		step.Options = append(step.Options, o.Value)
	}

	for _, rf := range sf.Validate {
		rule, err := toRule(rf)
		if err != nil {
			return step, err
		}
		step.Rules = append(step.Rules, rule)
	}

	next, err := toNext(sf.Next)
	if err != nil {
		return step, err
	}
	step.Next = next
	return step, nil
}

func toRule(rf ruleFile) (domain.FlowRule, error) {
	rule := domain.FlowRule{Name: rf.Rule, Error: rf.Error}
	if rule.Error == "" {
		return rule, fmt.Errorf("rule %q has no error code", rf.Rule)
	}
	switch rf.Rule {
	case domain.RuleMinLength, domain.RuleMaxLength, domain.RuleDigits:
		if err := json.Unmarshal(rf.Value, &rule.Number); err != nil || rule.Number < 1 {
			return rule, fmt.Errorf("rule %q needs a whole number value of 1 or more", rf.Rule)
		}
	case domain.RulePattern:
		if err := json.Unmarshal(rf.Value, &rule.Text); err != nil || rule.Text == "" {
			return rule, fmt.Errorf("rule %q needs a regular expression value", rf.Rule)
		}
		if _, err := regexp.Compile(rule.Text); err != nil {
			return rule, fmt.Errorf("rule %q: %w", rf.Rule, err)
		}
	case domain.RulePhoneET, domain.RuleDateValid:
		// no value
	default:
		return rule, fmt.Errorf("unknown rule %q", rf.Rule)
	}
	return rule, nil
}

func toNext(raw json.RawMessage) ([]domain.FlowNext, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var single string
	if err := json.Unmarshal(raw, &single); err == nil {
		return []domain.FlowNext{{Goto: single}}, nil
	}
	var rules []nextFile
	if err := json.Unmarshal(raw, &rules); err != nil {
		return nil, fmt.Errorf(`"next" must be a step ID or a list of rules`)
	}
	next := make([]domain.FlowNext, 0, len(rules))
	for _, r := range rules {
		n := domain.FlowNext{Goto: r.Goto}
		if r.When != nil {
			if r.When.Step == "" || (r.When.Equals == "") == (len(r.When.In) == 0) {
				return nil, fmt.Errorf(`"when" needs a step and exactly one of "equals" or "in"`)
			}
			n.When = &domain.FlowCondition{Step: r.When.Step, Equals: r.When.Equals, In: r.When.In}
		}
		next = append(next, n)
	}
	return next, nil
}

// checkLinks makes sure start, every "goto" and every "when.step" name a real step.
func checkLinks(flow *domain.Flow) error {
	if _, ok := flow.Step(flow.Start); !ok {
		return fmt.Errorf("start step %q doesn't exist", flow.Start)
	}
	for _, step := range flow.Steps {
		for _, n := range step.Next {
			if _, ok := flow.Step(n.Goto); !ok {
				return fmt.Errorf("step %q: next step %q doesn't exist", step.ID, n.Goto)
			}
			if n.When != nil {
				if _, ok := flow.Step(n.When.Step); !ok {
					return fmt.Errorf("step %q: condition on unknown step %q", step.ID, n.When.Step)
				}
			}
		}
	}
	return nil
}

func (s *FlowStore) loadNeeds(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("needs vocabulary: %w (check NEEDS_FILE)", err)
	}
	var vocab struct {
		Items []struct {
			Code string `json:"code"`
		} `json:"items"`
	}
	if err := json.Unmarshal(data, &vocab); err != nil {
		return fmt.Errorf("needs vocabulary: invalid JSON: %w", err)
	}
	for _, item := range vocab.Items {
		if item.Code == "" || s.isNeed[item.Code] {
			return fmt.Errorf("needs vocabulary: empty or repeated code %q", item.Code)
		}
		s.needs = append(s.needs, item.Code)
		s.isNeed[item.Code] = true
	}
	if len(s.needs) == 0 {
		return fmt.Errorf("needs vocabulary: no items")
	}
	return nil
}
