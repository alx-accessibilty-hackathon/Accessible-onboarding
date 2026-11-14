-- +goose Up
CREATE TABLE auth_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('learner', 'staff', 'partner_server')),
  subject_id   uuid NOT NULL,             -- learners.id, staff_users.id or partners.id
  token_hash   bytea NOT NULL UNIQUE,     -- SHA-256 of the token; the token itself is never stored
  scopes       text[] NOT NULL DEFAULT '{}',
  acting_for   uuid,                      -- learner id when partner staff fill in a form (E1)
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);
CREATE INDEX auth_sessions_subject_idx ON auth_sessions (subject_type, subject_id);

CREATE TABLE consents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('data_processing', 'cloud_speech', 'sms', 'telegram', 'partner_access')),
  granted    boolean NOT NULL,
  method     text NOT NULL CHECK (method IN ('tap', 'sms_code', 'spoken', 'partner_witnessed')),
  partner_id uuid REFERENCES partners(id),
  staff_id   uuid REFERENCES staff_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX consents_learner_kind_idx ON consents (learner_id, kind);

-- +goose Down
DROP TABLE consents;
DROP TABLE auth_sessions;
