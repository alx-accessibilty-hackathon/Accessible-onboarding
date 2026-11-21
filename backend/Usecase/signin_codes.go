package usecase

import (
	"context"
	"crypto/rand"
	"errors"
	"log"
	"math/big"
	"strings"
	"time"

	domain "bridge/Domain"

	"github.com/google/uuid"
)

// Sign in again: every learner who finished signing up has one 8-character sign-in code
// (XXXX-XXXX), shown on the Done screen and on their profile. Typed in "Continue with a code"
// on another phone (or after "Forget me on this phone"), with their date of birth or the last
// 4 digits of their phone, it opens their profile. Unlike a resume code (6 characters, 72 hours,
// one use, drafts only) it works again and again until the learner makes a new one.
// 5 wrong checks in a row lock it for 15 minutes. It only works with the key of the learner's
// own partner (a learner token works only there).
//
// Table signin_codes (migration 00008): the keyed hash is searched; the code is stored
// encrypted (learner ID as additional data) only so the profile can show it again.

const (
	signInCodeLength = 8
	// No 0/O, 1/I/L: easy to read aloud and copy by hand.
	signInCodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
	signInAttempts     = 5
)

// SignInCodes: what sign-in codes need (set in main.go; nil = not available).
type SignInCodes struct {
	Repo     domain.SignInCodeRepositoryI
	Security domain.SecurityService
	Profiles domain.ProfileRepositoryI // the learner's latest registration (its ID goes back to the widget)
}

func newSignInCode() (display, normalized string, err error) {
	b := make([]byte, signInCodeLength)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(signInCodeAlphabet))))
		if err != nil {
			return "", "", err
		}
		b[i] = signInCodeAlphabet[n.Int64()]
	}
	normalized = string(b)
	return normalized[:4] + "-" + normalized[4:], normalized, nil
}

// create makes and stores a new code for the learner, replacing the old one.
func (s *SignInCodes) create(ctx context.Context, learnerID uuid.UUID) (*domain.SignInCodeShown, error) {
	for try := 0; try < 5; try++ {
		display, normalized, err := newSignInCode()
		if err != nil {
			return nil, err
		}
		nonce, sealed, err := s.Security.Encrypt([]byte(display), learnerID.String())
		if err != nil {
			return nil, err
		}
		saved, err := s.Repo.Save(ctx, &domain.SignInCode{
			LearnerID: learnerID, CodeHash: s.Security.HashCode(normalized), CodeNonce: nonce, CodeCiphertext: sealed,
		})
		if errors.Is(err, domain.ErrAlreadyExists) {
			continue // another learner has this code: make another one
		}
		if err != nil {
			return nil, err
		}
		return &domain.SignInCodeShown{Code: display, CreatedAt: saved.CreatedAt}, nil
	}
	return nil, errors.New("sign-in code: no free code after 5 tries")
}

// show returns the learner's code, making one the first time.
func (s *SignInCodes) show(ctx context.Context, learnerID uuid.UUID) (*domain.SignInCodeShown, error) {
	c, err := s.Repo.GetByLearner(ctx, learnerID)
	if errors.Is(err, domain.ErrNotFound) {
		return s.create(ctx, learnerID)
	}
	if err != nil {
		return nil, err
	}
	plain, err := s.Security.Decrypt(c.CodeNonce, c.CodeCiphertext, learnerID.String())
	if err != nil {
		log.Print("error : sign-in code would not open, making a new one: ", err)
		return s.create(ctx, learnerID)
	}
	return &domain.SignInCodeShown{Code: string(plain), CreatedAt: c.CreatedAt}, nil
}

// registeredLearner: the signed-in learner, who must have finished signing up.
func (uc *MeUsecase) registeredLearner(ctx context.Context, actor domain.Actor) (*domain.Learner, error) {
	id, err := meLearnerID(actor)
	if err != nil {
		return nil, err
	}
	if uc.SignIn == nil {
		return nil, domain.ErrNotFound
	}
	learner, err := uc.LearnerRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if learner.Status != domain.LearnerStatusRegistered {
		return nil, domain.ErrNotRegistered
	}
	return learner, nil
}

// GetSignInCode (GET /me/sign-in-code): the learner's code, made the first time it is asked for.
func (uc *MeUsecase) GetSignInCode(ctx context.Context, actor domain.Actor) (*domain.SignInCodeShown, error) {
	learner, err := uc.registeredLearner(ctx, actor)
	if err != nil {
		return nil, err
	}
	return uc.SignIn.show(ctx, learner.ID)
}

// NewSignInCode (POST /me/sign-in-code): a new code; the old one stops working.
func (uc *MeUsecase) NewSignInCode(ctx context.Context, actor domain.Actor) (*domain.SignInCodeShown, error) {
	learner, err := uc.registeredLearner(ctx, actor)
	if err != nil {
		return nil, err
	}
	return uc.SignIn.create(ctx, learner.ID)
}

// findSignInCode: the sign-in code typed in "Continue with a code", for this partner's key.
// Unknown, another partner's learner, or a learner who isn't registered (any more): ErrNotFound.
func (u *RegistrationUsecase) findSignInCode(ctx context.Context, actor domain.Actor, input string) (*domain.SignInCode, *domain.Learner, error) {
	if u.SignIn == nil {
		return nil, nil, domain.ErrNotFound
	}
	normalized := u.Security.NormalizeCode(input)
	if len(normalized) != signInCodeLength {
		return nil, nil, domain.ErrNotFound
	}
	c, err := u.SignIn.Repo.GetByHash(ctx, u.Security.HashCode(normalized))
	if err != nil {
		return nil, nil, err
	}
	learner, err := u.LearnerRepo.GetByID(ctx, c.LearnerID)
	if err != nil {
		return nil, nil, domain.ErrNotFound
	}
	if learner.PartnerID != actor.PartnerID || learner.Status != domain.LearnerStatusRegistered {
		return nil, nil, domain.ErrNotFound
	}
	if c.LockedUntil != nil && time.Now().Before(*c.LockedUntil) {
		return nil, nil, domain.ErrTooManyAttempts
	}
	return c, learner, nil
}

// signInCheck: what the learner confirms: their date of birth, else their phone, else nothing.
func signInCheck(l *domain.Learner) string {
	switch {
	case l.DOB != nil:
		return "dob"
	case l.PhoneE164 != "":
		return "phone"
	default:
		return "none"
	}
}

func (u *RegistrationUsecase) signInLookup(ctx context.Context, actor domain.Actor, input string) (*domain.ResumeLookupResult, error) {
	_, learner, err := u.findSignInCode(ctx, actor, input)
	if err != nil {
		return nil, err
	}
	reg, err := u.SignIn.Profiles.GetLatestRegistration(ctx, learner.ID)
	if err != nil {
		return nil, err
	}
	return &domain.ResumeLookupResult{RegistrationID: reg.ID, Check: signInCheck(learner), SignIn: true}, nil
}

func (u *RegistrationUsecase) signInVerify(ctx context.Context, actor domain.Actor, input string, dob *domain.ResumeDOB, phoneLast4 string) (*domain.ResumeVerifyResult, int, error) {
	c, learner, err := u.findSignInCode(ctx, actor, input)
	if err != nil {
		return nil, 0, err
	}
	reg, err := u.SignIn.Profiles.GetLatestRegistration(ctx, learner.ID)
	if err != nil {
		return nil, 0, err
	}

	var matched bool
	switch signInCheck(learner) {
	case "dob":
		if dob != nil && dob.Year > 0 {
			if want, ok := resumeDOBDay(dob); ok {
				d := learner.DOB.UTC()
				matched = time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC).Equal(want)
			}
		}
	case "phone":
		last4 := strings.TrimSpace(phoneLast4)
		matched = isFourDigits(last4) && strings.HasSuffix(strings.ReplaceAll(learner.PhoneE164, " ", ""), last4)
	default:
		matched = true // nothing to confirm with: the code alone
	}

	if !matched {
		updated, err := u.SignIn.Repo.RecordFailure(ctx, learner.ID)
		left := signInAttempts - (c.FailedAttempts + 1)
		if err == nil && updated != nil {
			if updated.LockedUntil != nil && time.Now().Before(*updated.LockedUntil) {
				left = 0
			} else {
				left = signInAttempts - updated.FailedAttempts
			}
		}
		if left < 0 {
			left = 0
		}
		return nil, left, domain.ErrResumeCheckFailed
	}

	if err := u.SignIn.Repo.RecordSuccess(ctx, learner.ID); err != nil {
		return nil, 0, err
	}
	token, hash, err := u.Security.NewToken("lt_")
	if err != nil {
		return nil, 0, err
	}
	expiresAt := time.Now().Add(30 * 24 * time.Hour)
	if _, err := u.SessionRepo.CreateAuthSession(ctx, &domain.AuthSession{
		SubjectType: "learner", SubjectID: learner.ID, TokenHash: hash, ExpiresAt: expiresAt,
	}); err != nil {
		return nil, 0, err
	}
	return &domain.ResumeVerifyResult{RegistrationID: reg.ID, SessionToken: token, ExpiresAt: expiresAt, SignIn: true}, signInAttempts, nil
}
