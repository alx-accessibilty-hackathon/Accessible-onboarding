-- Learners, registrations, answers, identity evidence and referrals (Dev A).
-- Each query needs a "-- name: <GoMethodName> :one|:many|:exec|:execrows" line.
-- After editing, run `sqlc generate` (from backend/).

-- ---- learners ----

-- name: CreateLearner :one
INSERT INTO learners (partner_id, language, simple_mode)
VALUES ($1, $2, $3)
RETURNING id, partner_id, status, full_name, preferred_name, contact_method, phone_e164, phone_verified,
          dob, dob_calendar, language, simple_mode, identity_level, created_at, updated_at, registered_at;

-- name: GetLearner :one
SELECT id, partner_id, status, full_name, preferred_name, contact_method, phone_e164, phone_verified,
       dob, dob_calendar, language, simple_mode, identity_level, created_at, updated_at, registered_at
FROM learners
WHERE id = $1;

-- Only the values that were sent change (NULL keeps the current value).
-- name: UpdateLearnerPreferences :execrows
UPDATE learners
SET language    = COALESCE(sqlc.narg(language), language),
    simple_mode = COALESCE(sqlc.narg(simple_mode), simple_mode),
    updated_at  = now()
WHERE id = sqlc.arg(id);

-- Copies the submitted answers into the learner record (submit, inside a transaction).
-- name: UpdateLearnerProfile :one
UPDATE learners
SET full_name      = $2,
    preferred_name = $3,
    contact_method = $4,
    phone_e164     = $5,
    dob            = $6,
    dob_calendar   = $7,
    status         = 'registered',
    registered_at  = now(),
    updated_at     = now()
WHERE id = $1
RETURNING id, partner_id, status, full_name, preferred_name, contact_method, phone_e164, phone_verified,
          dob, dob_calendar, language, simple_mode, identity_level, created_at, updated_at, registered_at;

-- ---- registrations ----

-- name: CreateRegistration :one
INSERT INTO registrations (learner_id, flow_id, flow_version, current_step)
VALUES ($1, $2, $3, $4)
RETURNING id, learner_id, flow_id, flow_version, status, current_step, acting_staff_id, created_at, updated_at, submitted_at;

-- name: GetRegistration :one
SELECT id, learner_id, flow_id, flow_version, status, current_step, acting_staff_id, created_at, updated_at, submitted_at
FROM registrations
WHERE id = $1;

-- name: UpdateRegistrationProgress :execrows
UPDATE registrations
SET current_step = $2,
    updated_at   = now()
WHERE id = $1;

-- Only a draft can be submitted. 0 rows affected means it was already submitted
-- (the row lock also stops two submits running at the same time).
-- name: MarkRegistrationSubmitted :execrows
UPDATE registrations
SET status       = 'submitted',
    submitted_at = now(),
    updated_at   = now()
WHERE id = $1
  AND status = 'draft';

-- ---- answers ----

-- name: ListAnswers :many
SELECT registration_id, question_id, value, input_method, version, updated_at
FROM answers
WHERE registration_id = $1
ORDER BY question_id;

-- name: GetAnswer :one
SELECT registration_id, question_id, value, input_method, version, updated_at
FROM answers
WHERE registration_id = $1
  AND question_id = $2;

-- Saves an answer only if the client saw the latest version (R15, TECHNICAL_PLAN.md 5.2).
-- base_version 0 means "nothing saved yet". No row returned means another device saved first.
-- name: SaveAnswerIfVersion :one
INSERT INTO answers (registration_id, question_id, value, input_method, version, updated_at)
VALUES (sqlc.arg(registration_id), sqlc.arg(question_id), sqlc.arg(value), sqlc.arg(input_method), 1, now())
ON CONFLICT (registration_id, question_id) DO UPDATE
   SET value        = EXCLUDED.value,
       input_method = EXCLUDED.input_method,
       version      = answers.version + 1,
       updated_at   = now()
 WHERE answers.version = sqlc.arg(base_version)::int
RETURNING registration_id, question_id, value, input_method, version, updated_at;

-- ---- identity evidence and referrals ----

-- name: CreateIdentityEvidence :one
INSERT INTO identity_evidence (learner_id, route, doc_type, last4, level)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, learner_id, route, doc_type, last4, level, attested_by, attested_at, created_at;

-- name: CreateReferral :one
INSERT INTO referrals (learner_id, partner_id, contact_preference)
VALUES ($1, $2, $3)
RETURNING id, learner_id, partner_id, contact_preference, status, created_at, updated_at;

-- name: GetLatestReferralByLearner :one
SELECT id, learner_id, partner_id, contact_preference, status, created_at, updated_at
FROM referrals
WHERE learner_id = $1
ORDER BY created_at DESC
LIMIT 1;
