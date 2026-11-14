-- Career gateway: job postings (with the accommodations they offer) and applications.
-- From TECHNICAL_PLAN.md 5.5. Never edit a migration after it is merged; add a new one.

-- +goose Up
CREATE TABLE jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id     uuid REFERENCES employers(id),          -- null for imported jobs (C4)
  source          text NOT NULL DEFAULT 'local' CHECK (source IN ('local', 'imported')),
  source_url      text,
  title           text NOT NULL,
  description     text NOT NULL,
  location_type   text NOT NULL CHECK (location_type IN ('onsite', 'remote', 'hybrid')),
  location_text   text,
  work_hours      text,
  employment_type text NOT NULL CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'internship', 'temporary')),
  accommodations  text[] NOT NULL DEFAULT '{}',           -- codes from shared/vocab/needs.json
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz,
  CHECK (status <> 'published' OR published_at IS NOT NULL)
);
CREATE INDEX jobs_published_idx ON jobs (published_at DESC, id DESC) WHERE status = 'published';
CREATE INDEX jobs_employer_idx ON jobs (employer_id);
CREATE INDEX jobs_accommodations_idx ON jobs USING GIN (accommodations);

CREATE TABLE applications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  learner_id     uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  answers        jsonb NOT NULL,
  attach_support boolean NOT NULL DEFAULT false,         -- employer may see support needs only if true
  status         text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'seen', 'withdrawn')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, learner_id)
);
CREATE INDEX applications_learner_idx ON applications (learner_id);

-- +goose Down
DROP TABLE applications;
DROP TABLE jobs;
