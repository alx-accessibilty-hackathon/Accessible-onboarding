-- name: GetTTSAudio :one
-- Read-aloud audio cache (tts_cache): counts the hit and returns the audio.
UPDATE tts_cache
SET hits = hits + 1, last_hit_at = now()
WHERE cache_key = $1
RETURNING audio;

-- name: PutTTSAudio :exec
-- Two servers may make the same clip at once: the first one stays.
INSERT INTO tts_cache (cache_key, provider, voice, language, text, mime_type, audio)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (cache_key) DO NOTHING;

-- name: DeleteAllTTSAudio :execrows
-- `bridge tts-clear`: forget every clip (they are made again, once, when next asked for).
DELETE FROM tts_cache;
