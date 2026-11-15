-- Job applications (Dev A). UNIQUE (job_id, learner_id): applying twice fails with 23505.
-- After editing, run `sqlc generate` (from backend/).

-- name: CreateApplication :one
INSERT INTO applications (job_id, learner_id, answers, attach_support)
VALUES ($1, $2, $3, $4)
RETURNING id, job_id, learner_id, answers, attach_support, status, created_at;

-- Applications to one job, only if the job belongs to this employer (Q7), newest first.
-- The applicant's support request comes only when they attached it to this application,
-- and stays encrypted here (the use case decrypts it and writes the audit log).
-- name: ListApplicationsForEmployerJob :many
SELECT a.id, a.job_id, a.learner_id, a.answers, a.attach_support, a.status, a.created_at,
       l.full_name, l.preferred_name, l.contact_method, l.phone_e164, l.language,
       s.nonce AS support_nonce, s.ciphertext AS support_ciphertext
FROM applications a
JOIN jobs j ON j.id = a.job_id
JOIN learners l ON l.id = a.learner_id
LEFT JOIN support_requests s ON s.learner_id = a.learner_id AND a.attach_support
WHERE a.job_id = $1
  AND j.employer_id = $2
ORDER BY a.created_at DESC, a.id DESC;
