-- Job applications (Dev A). UNIQUE (job_id, learner_id): applying twice fails with 23505.
-- After editing, run `sqlc generate` (from backend/).

-- name: CreateApplication :one
INSERT INTO applications (job_id, learner_id, answers, attach_support)
VALUES ($1, $2, $3, $4)
RETURNING id, job_id, learner_id, answers, attach_support, status, created_at;
