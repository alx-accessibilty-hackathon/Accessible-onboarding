-- The referral queue of a referral organisation (R7): referrals with the learner's name,
-- contact and language. Never ID details or support needs.
-- After editing, run `sqlc generate` (from backend/).

-- The partner's referrals, newest first.
-- name: ListReferralsByPartner :many
SELECT r.id, r.learner_id, r.partner_id, r.contact_preference, r.status, r.created_at, r.updated_at,
       l.full_name, l.preferred_name, l.contact_method, l.phone_e164, l.language
FROM referrals r
JOIN learners l ON l.id = r.learner_id
WHERE r.partner_id = $1
ORDER BY r.created_at DESC, r.id DESC;

-- name: GetPartnerReferral :one
SELECT r.id, r.learner_id, r.partner_id, r.contact_preference, r.status, r.created_at, r.updated_at,
       l.full_name, l.preferred_name, l.contact_method, l.phone_e164, l.language
FROM referrals r
JOIN learners l ON l.id = r.learner_id
WHERE r.id = $1
  AND r.partner_id = $2;

-- 0 rows affected: the referral doesn't exist or belongs to another partner.
-- name: UpdateReferralStatus :execrows
UPDATE referrals
SET status     = $3,
    updated_at = now()
WHERE id = $1
  AND partner_id = $2;
