-- Sign-in codes (migration 00008): one per learner who finished signing up.

-- name: GetSignInCodeByLearner :one
SELECT * FROM signin_codes WHERE learner_id = $1;

-- name: GetSignInCodeByHash :one
SELECT * FROM signin_codes WHERE code_hash = $1;

-- A new code replaces the old one (and its wrong tries).
-- name: UpsertSignInCode :one
INSERT INTO signin_codes (learner_id, code_hash, code_nonce, code_ciphertext)
VALUES ($1, $2, $3, $4)
ON CONFLICT (learner_id) DO UPDATE
SET code_hash = EXCLUDED.code_hash,
    code_nonce = EXCLUDED.code_nonce,
    code_ciphertext = EXCLUDED.code_ciphertext,
    failed_attempts = 0,
    locked_until = NULL,
    last_used_at = NULL,
    created_at = now()
RETURNING *;

-- A wrong check. The 5th in a row locks the code for 15 minutes and starts the count again.
-- name: RecordSignInFailure :one
UPDATE signin_codes
SET failed_attempts = CASE WHEN failed_attempts + 1 >= 5 THEN 0 ELSE failed_attempts + 1 END,
    locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
WHERE learner_id = $1
RETURNING *;

-- name: RecordSignInSuccess :exec
UPDATE signin_codes
SET failed_attempts = 0, locked_until = NULL, last_used_at = now()
WHERE learner_id = $1;
