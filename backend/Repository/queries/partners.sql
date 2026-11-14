-- Queries for partners. Each query needs a "-- name: <GoMethodName> :one|:many|:exec" line.
-- After editing, run `sqlc generate` (from backend/).

-- name: GetPartnerByPublishableKey :one
SELECT id, slug, name, kind, publishable_key, allowed_origins, client_id, config, created_at
FROM partners
WHERE publishable_key = $1;

-- name: ListReferralPartners :many
SELECT id, name
FROM partners
WHERE kind = 'referral_org'
ORDER BY name;

-- name: ListAllowedOrigins :many
SELECT DISTINCT unnest(allowed_origins)::text AS origin
FROM partners
ORDER BY origin;
