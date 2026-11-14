-- Queries for consents. Table: consents.

-- name: CreateConsent :one
INSERT INTO consents (learner_id, kind, granted, method, partner_id, staff_id)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, learner_id, kind, granted, method, partner_id, staff_id, created_at, revoked_at;

-- name: ListConsentsByLearnerID :many
SELECT id, learner_id, kind, granted, method, partner_id, staff_id, created_at, revoked_at
FROM consents
WHERE learner_id = $1
ORDER BY created_at DESC;

-- The latest consent of this kind, revoked or not: the caller checks granted and revoked_at.
-- (Filtering revoked rows first would bring back an older consent after a revoke.)
-- name: GetConsentByLearnerAndKind :one
SELECT id, learner_id, kind, granted, method, partner_id, staff_id, created_at, revoked_at
FROM consents
WHERE learner_id = $1 AND kind = $2
ORDER BY created_at DESC
LIMIT 1;
