-- Queries for registrations. Table: registrations.

-- name: GetRegistrationByID :one
SELECT id, learner_id, flow_id, flow_version, status, current_step, acting_staff_id, created_at, updated_at, submitted_at
FROM registrations
WHERE id = $1;

-- name: GetAnswer :one
SELECT registration_id, question_id, value, input_method, version, updated_at
FROM answers
WHERE registration_id = $1 AND question_id = $2;

-- name: ListAnswersByRegistrationID :many
SELECT registration_id, question_id, value, input_method, version, updated_at
FROM answers
WHERE registration_id = $1;
