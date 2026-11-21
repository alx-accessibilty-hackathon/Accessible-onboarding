package usecase

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	domain "bridge/Domain"
)

// PartnerSignupUsecase is self-service partner sign-up (POST /partners): the server makes a
// publishable key and an OAuth client, saves the partner, and the key works at once.
// The client secret is returned once; only its SHA-256 hash is stored.
//
// It is open on purpose (demo and judges): no approval step, both partner kinds. Limits: a
// daily cap here (per server process) and a per-IP rate limit on the route.
type PartnerSignupUsecase struct {
	Partners   domain.PartnerCreatorI
	HashSecret func(string) []byte // SHA-256, the same hash the OAuth token check uses
	On         bool                // PARTNER_SELF_SERVICE
	DailyLimit int                 // PARTNER_SIGNUP_DAILY_LIMIT, 0 = no limit
	OnCreated  func()              // optional: reload the CORS origin list (main.go)

	mu    sync.Mutex
	day   string
	count int
}

var _ domain.PartnerSignupUsecaseI = (*PartnerSignupUsecase)(nil)

func NewPartnerSignupUsecase(partners domain.PartnerCreatorI, hashSecret func(string) []byte, on bool, dailyLimit int) *PartnerSignupUsecase {
	return &PartnerSignupUsecase{Partners: partners, HashSecret: hashSecret, On: on, DailyLimit: dailyLimit}
}

var (
	partnerSlugRe   = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,39}$`)
	languageCodeRe  = regexp.MustCompile(`^[a-z]{2,3}$`)
	helpPhoneRe     = regexp.MustCompile(`^\+?[0-9][0-9 ()-]{2,24}$`)
	telegramRe      = regexp.MustCompile(`^@?[A-Za-z0-9_]{3,32}$`)
	themeColourRe   = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	maxOrigins      = 20
	maxLanguages    = 10
	partnerSignupOK = map[string]bool{domain.PartnerKindPlatform: true, domain.PartnerKindReferralOrg: true}
)

func (uc *PartnerSignupUsecase) CreatePartner(ctx context.Context, in domain.PartnerSignup) (*domain.CreatedPartner, error) {
	if !uc.On {
		return nil, domain.ErrPartnerSignupOff
	}
	p, err := checkPartnerSignup(in)
	if err != nil {
		return nil, err
	}
	if !uc.takeDailySlot() {
		return nil, domain.ErrRateLimited
	}

	key, err := randomHex(16)
	if err != nil {
		return nil, err
	}
	p.PublishableKey = "pk_live_" + key
	clientSuffix, err := randomHex(3)
	if err != nil {
		return nil, err
	}
	p.ClientID = p.Slug + "-" + clientSuffix
	secretBytes := make([]byte, 32) // 256 random bits
	if _, err := rand.Read(secretBytes); err != nil {
		return nil, err
	}
	secret := "cs_" + base64.RawURLEncoding.EncodeToString(secretBytes)
	p.SecretHash = uc.HashSecret(secret)

	created, err := uc.Partners.Create(ctx, p)
	if err != nil {
		uc.giveBackDailySlot()
		return nil, err // ErrAlreadyExists: the slug is taken
	}
	if uc.OnCreated != nil {
		uc.OnCreated()
	}
	return &domain.CreatedPartner{Partner: created, ClientSecret: secret}, nil
}

// checkPartnerSignup trims and checks the form; every problem is reported at once.
func checkPartnerSignup(in domain.PartnerSignup) (domain.NewPartner, error) {
	verr := &domain.ValidationError{}
	add := func(field, code string) {
		verr.Fields = append(verr.Fields, domain.FieldError{Field: field, Code: code})
	}

	name := strings.TrimSpace(in.Name)
	switch n := len([]rune(name)); {
	case n == 0:
		add("name", "required")
	case n < 2:
		add("name", "too_short")
	case n > 80:
		add("name", "too_long")
	}

	slug := strings.ToLower(strings.TrimSpace(in.Slug))
	if slug == "" {
		add("slug", "required")
	} else if !partnerSlugRe.MatchString(slug) {
		add("slug", "invalid")
	}

	kind := strings.TrimSpace(in.Kind)
	if kind == "" {
		kind = domain.PartnerKindPlatform
	}
	if !partnerSignupOK[kind] {
		add("kind", "invalid_choice")
	}

	origins := make([]string, 0, len(in.AllowedOrigins))
	seen := map[string]bool{}
	for _, raw := range in.AllowedOrigins {
		if strings.TrimSpace(raw) == "" {
			continue
		}
		o, ok := normalizeOrigin(raw)
		if !ok {
			add("allowed_origins", "invalid_origin")
			break
		}
		if !seen[o] {
			seen[o] = true
			origins = append(origins, o)
		}
	}
	switch {
	case len(origins) == 0 && !hasField(verr, "allowed_origins"):
		add("allowed_origins", "required")
	case len(origins) > maxOrigins:
		add("allowed_origins", "too_many")
	}

	languages := make([]string, 0, len(in.Languages))
	for _, l := range in.Languages {
		l = strings.ToLower(strings.TrimSpace(l))
		if l == "" {
			continue
		}
		if !languageCodeRe.MatchString(l) {
			add("languages", "invalid")
			break
		}
		if !containsString(languages, l) {
			languages = append(languages, l)
		}
	}
	if len(languages) == 0 {
		languages = []string{"am", "en"}
	}
	if len(languages) > maxLanguages {
		add("languages", "too_many")
	}
	defaultLanguage := strings.ToLower(strings.TrimSpace(in.DefaultLanguage))
	if defaultLanguage == "" {
		defaultLanguage = languages[0]
	} else if !containsString(languages, defaultLanguage) {
		add("default_language", "invalid_choice")
	}

	help := map[string]any{}
	if phone := strings.TrimSpace(in.HelpPhone); phone != "" {
		if !helpPhoneRe.MatchString(phone) {
			add("help.phone", "invalid")
		}
		help["phone"] = phone
	}
	if tg := strings.TrimSpace(in.HelpTelegram); tg != "" {
		if !telegramRe.MatchString(tg) {
			add("help.telegram", "invalid")
		}
		help["telegram"] = "@" + strings.TrimPrefix(tg, "@")
	}

	config := map[string]any{"languages": languages, "default_language": defaultLanguage}
	if len(help) > 0 {
		config["help"] = help
	}
	if colour := strings.TrimSpace(in.ThemePrimary); colour != "" {
		if !themeColourRe.MatchString(colour) {
			add("theme.primary", "invalid")
		}
		config["theme"] = map[string]any{"primary": strings.ToLower(colour)}
	}

	if len(verr.Fields) > 0 {
		return domain.NewPartner{}, verr
	}
	return domain.NewPartner{Slug: slug, Name: name, Kind: kind, AllowedOrigins: origins, Config: config}, nil
}

// normalizeOrigin accepts exactly an origin as browsers send it: http(s)://host[:port], no
// path, query, user or wildcard. It returns it lower-case without a trailing slash.
func normalizeOrigin(raw string) (string, bool) {
	raw = strings.TrimRight(strings.TrimSpace(raw), "/")
	if strings.Contains(raw, "*") {
		return "", false
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return "", false
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "https" && scheme != "http" {
		return "", false
	}
	return fmt.Sprintf("%s://%s", scheme, strings.ToLower(u.Host)), true
}

// takeDailySlot counts one new partner today (UTC); false when the daily cap is reached.
func (uc *PartnerSignupUsecase) takeDailySlot() bool {
	uc.mu.Lock()
	defer uc.mu.Unlock()
	today := time.Now().UTC().Format("2006-01-02")
	if uc.day != today {
		uc.day, uc.count = today, 0
	}
	if uc.DailyLimit > 0 && uc.count >= uc.DailyLimit {
		return false
	}
	uc.count++
	return true
}

func (uc *PartnerSignupUsecase) giveBackDailySlot() {
	uc.mu.Lock()
	defer uc.mu.Unlock()
	if uc.count > 0 {
		uc.count--
	}
}

func hasField(verr *domain.ValidationError, field string) bool {
	for _, f := range verr.Fields {
		if f.Field == field {
			return true
		}
	}
	return false
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
