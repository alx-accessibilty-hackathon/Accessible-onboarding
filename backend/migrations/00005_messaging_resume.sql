-- +goose Up
CREATE TABLE resume_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  token_hash      bytea NOT NULL UNIQUE,   -- SHA-256 of the 128-bit link token
  code_hash       bytea NOT NULL,          -- HMAC-SHA256 of the 6-character code (keyed: CODE_HASH_KEY)
  failed_attempts int NOT NULL DEFAULT 0,
  expires_at      timestamptz NOT NULL,    -- created_at + 72 hours
  used_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX resume_active_code_idx ON resume_tokens (code_hash) WHERE used_at IS NULL;

CREATE TABLE verification_codes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164      text NOT NULL,
  purpose         text NOT NULL CHECK (purpose IN ('login', 'consent', 'verify_phone')),
  code_hash       bytea NOT NULL,
  learner_id      uuid REFERENCES learners(id) ON DELETE CASCADE,
  failed_attempts int NOT NULL DEFAULT 0,
  expires_at      timestamptz NOT NULL,    -- 10 minutes
  used_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_phone_idx ON verification_codes (phone_e164, purpose);

CREATE TABLE messages_outbox (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel    text NOT NULL CHECK (channel IN ('sms', 'telegram')),
  recipient  text NOT NULL,
  body       text NOT NULL,
  status     text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  provider   text,
  error      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at    timestamptz
);

-- +goose Down
DROP TABLE messages_outbox;
DROP TABLE verification_codes;
DROP TABLE resume_tokens;
