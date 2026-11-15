-- The audit log: who read or deleted personal data.
-- After editing, run `sqlc generate` (from backend/).

-- One audit row. meta never holds personal data (IDs only).
-- name: CreateAuditLog :exec
INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, meta)
VALUES ($1, $2, $3, $4, $5, $6);
