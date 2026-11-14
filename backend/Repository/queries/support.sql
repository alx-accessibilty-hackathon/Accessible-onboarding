-- Support requests (Dev A). The needs are stored only as AES-GCM ciphertext.
-- After editing, run `sqlc generate` (from backend/).

-- One support request per learner: saving again replaces it.
-- name: UpsertSupportRequest :one
INSERT INTO support_requests (learner_id, nonce, ciphertext, share_courses, share_employers)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (learner_id) DO UPDATE
   SET nonce           = EXCLUDED.nonce,
       ciphertext      = EXCLUDED.ciphertext,
       share_courses   = EXCLUDED.share_courses,
       share_employers = EXCLUDED.share_employers,
       updated_at      = now()
RETURNING updated_at;

-- For the support inbox (Should). Returns the encrypted payload; decrypt with the learner ID.
-- name: GetSupportRequestByLearner :one
SELECT id, learner_id, nonce, ciphertext, share_courses, share_employers, created_at, updated_at
FROM support_requests
WHERE learner_id = $1;

-- name: SupportRequestExists :one
SELECT EXISTS (SELECT 1 FROM support_requests WHERE learner_id = $1);
