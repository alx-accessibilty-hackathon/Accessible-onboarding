-- +goose Up
-- Read-aloud audio of FIXED interface text (questions, options, buttons; never a learner's own
-- words), kept in the database so every API instance shares it and it survives restarts and
-- redeploys (a free hosting plan has no lasting disk). A text-to-speech provider is then paid
-- once per text, voice and language, not once per visitor.
CREATE TABLE tts_cache (
  cache_key   text PRIMARY KEY,                    -- provider|voice|language|sha256(text)
  provider    text NOT NULL,                       -- addis, azure
  voice       text NOT NULL,                       -- e.g. am-hamen
  language    text NOT NULL,                       -- am, en
  text        text NOT NULL,                       -- the text that was read (fixed interface text)
  mime_type   text NOT NULL DEFAULT 'audio/mpeg',
  audio       bytea NOT NULL,
  hits        integer NOT NULL DEFAULT 0,          -- times it was served from here
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_hit_at timestamptz
);

-- +goose Down
DROP TABLE tts_cache;
