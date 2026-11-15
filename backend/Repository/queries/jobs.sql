-- Jobs (Dev A). Public queries only ever return published jobs.
-- After editing, run `sqlc generate` (from backend/).

-- Newest first. The cursor is the (published_at, id) of the last job on the previous page;
-- both are NULL for the first page.
-- name: ListPublishedJobs :many
SELECT j.id, j.employer_id, j.source, j.title, j.description, j.location_type, j.location_text,
       j.work_hours, j.employment_type, j.accommodations, j.status, j.created_at, j.published_at,
       COALESCE(e.name, '')::text AS employer_name
FROM jobs j
LEFT JOIN employers e ON e.id = j.employer_id
WHERE j.status = 'published'
  AND (sqlc.narg(after_published_at)::timestamptz IS NULL
       OR (j.published_at, j.id) < (sqlc.narg(after_published_at)::timestamptz, sqlc.narg(after_id)::uuid))
ORDER BY j.published_at DESC, j.id DESC
LIMIT sqlc.arg(row_limit);

-- name: GetPublishedJob :one
SELECT j.id, j.employer_id, j.source, j.title, j.description, j.location_type, j.location_text,
       j.work_hours, j.employment_type, j.accommodations, j.status, j.created_at, j.published_at,
       COALESCE(e.name, '')::text AS employer_name
FROM jobs j
LEFT JOIN employers e ON e.id = j.employer_id
WHERE j.id = $1
  AND j.status = 'published';

-- name: ListJobsByEmployer :many
SELECT j.id, j.employer_id, j.source, j.title, j.description, j.location_type, j.location_text,
       j.work_hours, j.employment_type, j.accommodations, j.status, j.created_at, j.published_at,
       COALESCE(e.name, '')::text AS employer_name
FROM jobs j
LEFT JOIN employers e ON e.id = j.employer_id
WHERE j.employer_id = $1
ORDER BY j.created_at DESC, j.id DESC;

-- name: CreateJob :one
INSERT INTO jobs (employer_id, source, title, description, location_type, location_text,
                  work_hours, employment_type, accommodations)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id, employer_id, source, title, description, location_type, location_text,
          work_hours, employment_type, accommodations, status, created_at, published_at;

-- Only the employer who owns the job can publish it. Publishing twice keeps the first date.
-- No row returned: the job doesn't exist, belongs to another employer, or is closed.
-- name: PublishJob :one
UPDATE jobs
SET status       = 'published',
    published_at = COALESCE(published_at, now())
WHERE id = $1
  AND employer_id = $2
  AND status IN ('draft', 'published')
RETURNING id, employer_id, source, title, description, location_type, location_text,
          work_hours, employment_type, accommodations, status, created_at, published_at;
