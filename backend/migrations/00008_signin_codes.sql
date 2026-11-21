-- +goose Up
-- Sign in again (on another phone, or after "Forget me on this phone"): every learner who has
-- finished signing up has one 8-character sign-in code. It is shown when they finish and on
-- their profile, and typed in "Continue with a code" together with their date of birth (or the
-- last 4 digits of their phone). Unlike a resume code it can be used again and again.
-- Looked up by a keyed hash; kept encrypted (AES-256-GCM, learner ID as additional data) only
-- so the profile can show it again.
CREATE TABLE signin_codes (
  learner_id      uuid PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE,
  code_hash       bytea NOT NULL UNIQUE,     -- HMAC-SHA256 of the normalised code (CODE_HASH_KEY)
  code_nonce      bytea NOT NULL,
  code_ciphertext bytea NOT NULL,
  failed_attempts int NOT NULL DEFAULT 0,    -- wrong checks in a row; 5 lock the code for 15 minutes
  locked_until    timestamptz,
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE signin_codes;
