-- Queries for learners. Table: learners.

-- name: GetLearnerByID :one
SELECT id, partner_id, status, full_name, preferred_name, contact_method, phone_e164, phone_verified, dob, dob_calendar, language, simple_mode, identity_level, created_at, updated_at, registered_at
FROM learners
WHERE id = $1;

-- name: GetLearnerByIDAndPartnerID :one
SELECT id, partner_id, status, full_name, preferred_name, contact_method, phone_e164, phone_verified, dob, dob_calendar, language, simple_mode, identity_level, created_at, updated_at, registered_at
FROM learners
WHERE id = $1 AND partner_id = $2;

-- name: ListLearnersByPartnerID :many
SELECT id, partner_id, status, full_name, preferred_name, contact_method, phone_e164, phone_verified, dob, dob_calendar, language, simple_mode, identity_level, created_at, updated_at, registered_at
FROM learners
WHERE partner_id = $1
ORDER BY created_at DESC;
