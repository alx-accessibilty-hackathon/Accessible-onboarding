-- Trusted referral: one-time codes partner staff make to vouch for a learner (migration 00007).
-- After editing, run `sqlc generate` (from backend/).

-- A new code replaces the older unused ones of the same referral.
-- name: RetireVouchCodes :exec
UPDATE vouch_codes
SET used_at = now()
WHERE referral_id = $1
  AND used_at IS NULL;

-- name: CreateVouchCode :one
INSERT INTO vouch_codes (referral_id, learner_id, partner_id, staff_id, code_hash, expires_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, expires_at;

-- The learner's newest unused code (expired ones too: the use case says "expired").
-- name: GetActiveVouchCode :one
SELECT id, referral_id, learner_id, partner_id, staff_id, code_hash, failed_attempts, expires_at
FROM vouch_codes
WHERE learner_id = $1
  AND used_at IS NULL
ORDER BY created_at DESC
LIMIT 1;

-- name: AddVouchCodeFailure :one
UPDATE vouch_codes
SET failed_attempts = failed_attempts + 1
WHERE id = $1
RETURNING failed_attempts;

-- 0 rows: someone used it a moment ago.
-- name: UseVouchCode :execrows
UPDATE vouch_codes
SET used_at = now()
WHERE id = $1
  AND used_at IS NULL;

-- name: SetLearnerIdentityLevel :exec
UPDATE learners
SET identity_level = $2,
    updated_at     = now()
WHERE id = $1;

-- The learner's latest identity evidence (from the sign-up) records who vouched and when.
-- name: AttestLatestIdentityEvidence :exec
UPDATE identity_evidence
SET level       = 'partner_attested',
    attested_by = $2,
    attested_at = now()
WHERE id = (
  SELECT ie.id FROM identity_evidence ie
  WHERE ie.learner_id = $1
  ORDER BY ie.created_at DESC
  LIMIT 1
);

-- name: SetReferralAttested :exec
UPDATE referrals
SET status     = 'attested',
    updated_at = now()
WHERE id = $1;
