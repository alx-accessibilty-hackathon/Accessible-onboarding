-- +goose Up
-- Trusted referral (E1): partner staff vouch for a learner with no ID. The staff member makes a
-- one-time code, tells it to the learner (in person or by phone), and the learner types it on
-- their profile: that is their agreement. Then the learner is "confirmed by a partner"
-- (learners.identity_level and identity_evidence.level = 'partner_attested').
CREATE TABLE vouch_codes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id     uuid NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  learner_id      uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  partner_id      uuid NOT NULL REFERENCES partners(id),
  staff_id        uuid NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  code_hash       bytea NOT NULL,           -- HMAC-SHA256 of the 6-digit code (CODE_HASH_KEY)
  failed_attempts int NOT NULL DEFAULT 0,   -- 5 wrong tries end the code
  expires_at      timestamptz NOT NULL,     -- created_at + 30 minutes
  used_at         timestamptz,              -- used, or replaced by a newer code
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vouch_codes_learner_idx ON vouch_codes (learner_id) WHERE used_at IS NULL;

-- +goose Down
DROP TABLE vouch_codes;
