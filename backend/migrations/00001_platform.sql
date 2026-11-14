-- Platform tables: partners, employers, staff accounts, audit log.
-- From TECHNICAL_PLAN.md 5.5. Never edit a migration after it is merged; add a new one.

-- +goose Up
CREATE TABLE partners (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text NOT NULL UNIQUE,
  name               text NOT NULL,
  kind               text NOT NULL CHECK (kind IN ('platform', 'referral_org')),
  publishable_key    text NOT NULL UNIQUE,              -- public: goes in the widget's HTML
  allowed_origins    text[] NOT NULL DEFAULT '{}',      -- e.g. {'https://savanna.example'}
  client_id          text UNIQUE,                       -- OAuth client credentials (server-to-server)
  client_secret_hash bytea,                             -- SHA-256 of the secret; never the secret itself
  config             jsonb NOT NULL DEFAULT '{}'::jsonb,-- languages, help contact, theme, id routes
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE employers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff_users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text NOT NULL UNIQUE,
  password_hash      text NOT NULL,                      -- bcrypt
  display_name       text NOT NULL,
  role               text NOT NULL CHECK (role IN ('partner_staff', 'employer', 'support', 'admin')),
  partner_id         uuid REFERENCES partners(id),
  employer_id        uuid REFERENCES employers(id),
  daily_attest_limit int NOT NULL DEFAULT 10,            -- E1 fraud limit
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (role <> 'partner_staff' OR partner_id IS NOT NULL),
  CHECK (role <> 'employer' OR employer_id IS NOT NULL)
);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_type  text NOT NULL,                             -- learner | staff | partner_server | system
  actor_id    uuid,
  action      text NOT NULL,                             -- e.g. 'support_request.read'
  target_type text,
  target_id   uuid,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,        -- never personal data
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_target_idx ON audit_log (target_type, target_id);

-- +goose Down
DROP TABLE audit_log;
DROP TABLE staff_users;
DROP TABLE employers;
DROP TABLE partners;
