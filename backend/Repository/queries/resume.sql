-- Queries for resume tokens, verification codes and outbox messages.

-- name: CreateResumeToken :one
INSERT INTO resume_tokens (
  registration_id, token_hash, code_hash, expires_at
) VALUES (
  $1, $2, $3, $4
)
RETURNING id, registration_id, token_hash, code_hash, failed_attempts, expires_at, used_at, created_at;

-- name: GetResumeTokenByCodeHash :one
SELECT id, registration_id, token_hash, code_hash, failed_attempts, expires_at, used_at, created_at
FROM resume_tokens
WHERE code_hash = $1 AND used_at IS NULL;

-- name: GetResumeTokenByTokenHash :one
SELECT id, registration_id, token_hash, code_hash, failed_attempts, expires_at, used_at, created_at
FROM resume_tokens
WHERE token_hash = $1 AND used_at IS NULL;

-- name: IncrementResumeTokenFailedAttempts :one
UPDATE resume_tokens
SET failed_attempts = failed_attempts + 1
WHERE id = $1
RETURNING id, registration_id, token_hash, code_hash, failed_attempts, expires_at, used_at, created_at;

-- name: MarkResumeTokenUsed :exec
UPDATE resume_tokens
SET used_at = now()
WHERE id = $1;

-- name: CreateVerificationCode :one
INSERT INTO verification_codes (
  phone_e164, purpose, code_hash, learner_id, expires_at
) VALUES (
  $1, $2, $3, $4, $5
)
RETURNING id, phone_e164, purpose, code_hash, learner_id, failed_attempts, expires_at, used_at, created_at;

-- name: GetActiveVerificationCode :one
SELECT id, phone_e164, purpose, code_hash, learner_id, failed_attempts, expires_at, used_at, created_at
FROM verification_codes
WHERE phone_e164 = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
ORDER BY created_at DESC
LIMIT 1;

-- name: MarkVerificationCodeUsed :exec
UPDATE verification_codes
SET used_at = now()
WHERE id = $1;

-- name: IncrementVerificationCodeFailedAttempts :one
UPDATE verification_codes
SET failed_attempts = failed_attempts + 1
WHERE id = $1
RETURNING id, phone_e164, purpose, code_hash, learner_id, failed_attempts, expires_at, used_at, created_at;

-- name: CreateOutboxMessage :one
INSERT INTO messages_outbox (
  channel, recipient, body, status, provider
) VALUES (
  $1, $2, $3, $4, $5
)
RETURNING id, channel, recipient, body, status, provider, error, created_at, sent_at;

-- name: MarkOutboxMessage :exec
-- What the SMS provider said: status 'sent' (accepted for delivery) or 'failed' (with the reason).
UPDATE messages_outbox
SET status = sqlc.arg(status),
    provider = sqlc.arg(provider),
    error = sqlc.narg(error),
    sent_at = CASE WHEN sqlc.arg(status) = 'sent' THEN now() ELSE sent_at END
WHERE id = sqlc.arg(id);

-- name: ListQueuedOutboxMessages :many
SELECT id, channel, recipient, body, status, provider, error, created_at, sent_at
FROM messages_outbox
WHERE status = 'queued'
ORDER BY created_at ASC;
