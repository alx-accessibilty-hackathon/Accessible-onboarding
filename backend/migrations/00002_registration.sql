-- +goose Up
CREATE TABLE learners (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id     uuid NOT NULL REFERENCES partners(id),  -- the platform where they signed up
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'registered', 'deleted')),
  full_name      text,
  preferred_name text,
  contact_method text CHECK (contact_method IN ('phone', 'telegram', 'partner', 'none')),
  phone_e164     text,
  phone_verified boolean NOT NULL DEFAULT false,         -- R17: unverified is allowed
  dob            date,
  dob_calendar   text CHECK (dob_calendar IN ('ethiopian', 'gregorian')),
  language       text NOT NULL DEFAULT 'am',
  simple_mode    boolean NOT NULL DEFAULT false,
  identity_level text NOT NULL DEFAULT 'self_declared'
                 CHECK (identity_level IN ('self_declared', 'partner_attested', 'verified')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  registered_at  timestamptz
);
CREATE INDEX learners_partner_idx ON learners (partner_id);
CREATE INDEX learners_phone_dob_idx ON learners (phone_e164, dob) WHERE phone_e164 IS NOT NULL; -- R18 duplicate check

CREATE TABLE registrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id      uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  flow_id         text NOT NULL,
  flow_version    int  NOT NULL,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  current_step    text,
  acting_staff_id uuid REFERENCES staff_users(id),      -- set when partner staff fill it in (E1)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  submitted_at    timestamptz
);
CREATE INDEX registrations_learner_idx ON registrations (learner_id);
CREATE INDEX registrations_draft_idx ON registrations (updated_at) WHERE status = 'draft'; -- Q6 clean-up

CREATE TABLE answers (
  registration_id uuid NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  question_id     text NOT NULL,
  value           jsonb NOT NULL,
  input_method    text NOT NULL CHECK (input_method IN ('typed', 'voice', 'choice', 'partner')),
  version         int  NOT NULL DEFAULT 1,              -- R15 conflict rule
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (registration_id, question_id)
);

CREATE TABLE identity_evidence (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id  uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  route       text NOT NULL CHECK (route IN ('fayda', 'kebele_id', 'refugee_id', 'unhcr_proof', 'other_document', 'none')),
  doc_type    text,                                     -- for other_document: student_id, birth_certificate, idir_equb_id, kebele_letter, ...
  last4       text CHECK (last4 ~ '^[0-9A-Za-z]{4}$'),
  level       text NOT NULL DEFAULT 'self_declared' CHECK (level IN ('self_declared', 'partner_attested', 'verified')),
  attested_by uuid REFERENCES staff_users(id),
  attested_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX identity_learner_idx ON identity_evidence (learner_id);

CREATE TABLE referrals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id         uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  partner_id         uuid NOT NULL REFERENCES partners(id),
  contact_preference text NOT NULL CHECK (contact_preference IN ('phone', 'telegram', 'in_person')),
  status             text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'in_progress', 'attested', 'closed')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX referrals_partner_status_idx ON referrals (partner_id, status);

CREATE TABLE support_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id      uuid NOT NULL UNIQUE REFERENCES learners(id) ON DELETE CASCADE,  -- one per learner
  ciphertext      bytea NOT NULL,   -- AES-256-GCM of {"needs":[...],"other_text":"..."}
  nonce           bytea NOT NULL,
  share_courses   boolean NOT NULL DEFAULT false,
  share_employers boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE support_requests;
DROP TABLE referrals;
DROP TABLE identity_evidence;
DROP TABLE answers;
DROP TABLE registrations;
DROP TABLE learners;
