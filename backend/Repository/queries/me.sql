-- The learner's own data for /me: see, change, delete (Q4).
-- After editing, run `sqlc generate` (from backend/).

-- The learner's newest registration (draft or submitted).
-- name: GetLatestRegistrationByLearner :one
SELECT id, learner_id, flow_id, flow_version, status, current_step, acting_staff_id, created_at, updated_at, submitted_at
FROM registrations
WHERE learner_id = $1
ORDER BY created_at DESC, id DESC
LIMIT 1;

-- name: GetLatestIdentityEvidenceByLearner :one
SELECT id, learner_id, route, doc_type, last4, level, attested_by, attested_at, created_at
FROM identity_evidence
WHERE learner_id = $1
ORDER BY created_at DESC, id DESC
LIMIT 1;

-- PATCH /me: the use case sends every value (the current one when it doesn't change).
-- A different phone number is not verified any more.
-- name: UpdateLearnerContact :one
UPDATE learners
SET full_name      = sqlc.narg(full_name),
    preferred_name = sqlc.narg(preferred_name),
    contact_method = sqlc.narg(contact_method),
    phone_verified = CASE WHEN phone_e164 IS DISTINCT FROM sqlc.narg(phone_e164) THEN false ELSE phone_verified END,
    phone_e164     = sqlc.narg(phone_e164),
    dob            = sqlc.narg(dob),
    dob_calendar   = sqlc.narg(dob_calendar),
    language       = sqlc.arg(language),
    simple_mode    = sqlc.arg(simple_mode),
    updated_at     = now()
WHERE id = sqlc.arg(id)
RETURNING id, partner_id, status, full_name, preferred_name, contact_method, phone_e164, phone_verified,
          dob, dob_calendar, language, simple_mode, identity_level, created_at, updated_at, registered_at;

-- Data minimisation: when the learner stops sharing a phone number, the copy in their saved
-- sign-up answers goes too.
-- name: DeletePhoneAnswersByLearner :exec
DELETE FROM answers
WHERE question_id = 'phone'
  AND registration_id IN (SELECT id FROM registrations WHERE learner_id = $1);

-- Everything else about the learner goes with it (ON DELETE CASCADE): registrations → answers
-- and resume tokens, identity evidence, referrals, the support request, consents,
-- applications and verification codes.
-- name: DeleteLearner :execrows
DELETE FROM learners
WHERE id = $1;

-- auth_sessions has no foreign key (subject_id can be a learner, staff or partner), so the
-- learner's sessions, and staff sessions acting for them (E1), are deleted here.
-- name: DeleteLearnerSessions :exec
DELETE FROM auth_sessions
WHERE (subject_type = 'learner' AND subject_id = $1)
   OR acting_for = $1;

-- The learner typed the SMS code sent to this number: it is confirmed. Only while the stored
-- number is still the one the code was sent to (0 rows otherwise).
-- name: SetLearnerPhoneVerified :execrows
UPDATE learners
SET phone_verified = true,
    updated_at     = now()
WHERE id = sqlc.arg(id)
  AND phone_e164 = sqlc.arg(phone_e164);
