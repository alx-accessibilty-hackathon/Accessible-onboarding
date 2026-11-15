-- Staff accounts (partner staff, employers, support, admin). Table: staff_users.
-- After editing, run `sqlc generate` (from backend/).

-- Emails are compared without case: "Employer@Example.org" signs in as employer@example.org.
-- name: GetStaffByEmail :one
SELECT id, email, password_hash, display_name, role, partner_id, employer_id, daily_attest_limit, created_at
FROM staff_users
WHERE lower(email) = lower($1);

-- name: GetStaffByID :one
SELECT id, email, password_hash, display_name, role, partner_id, employer_id, daily_attest_limit, created_at
FROM staff_users
WHERE id = $1;
