-- Queries for auth sessions. Table: auth_sessions.

-- name: CreateAuthSession :one
INSERT INTO auth_sessions (
  subject_type, subject_id, token_hash, scopes, acting_for, expires_at
) VALUES (
  $1, $2, $3, $4, $5, $6
)
RETURNING id, subject_type, subject_id, token_hash, scopes, acting_for, created_at, last_used_at, expires_at, revoked_at;

-- name: GetAuthSessionByTokenHash :one
SELECT id, subject_type, subject_id, token_hash, scopes, acting_for, created_at, last_used_at, expires_at, revoked_at
FROM auth_sessions
WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now();

-- name: RevokeAuthSession :exec
UPDATE auth_sessions
SET revoked_at = now()
WHERE id = $1;

-- Records that the session was used. Learner sessions also slide their expiry (30 days from now);
-- pass NULL to keep the expiry (staff and partner-server sessions).
-- name: TouchAuthSession :exec
UPDATE auth_sessions
SET last_used_at = now(),
    expires_at   = COALESCE(sqlc.narg(new_expires_at)::timestamptz, expires_at)
WHERE id = sqlc.arg(id);
