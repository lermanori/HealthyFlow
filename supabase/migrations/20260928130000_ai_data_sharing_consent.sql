-- Explicit permission to share personal data with third-party AI providers.
--
-- Consent is operational/legal state, not part of a person's Local day. Each
-- choice is append-only so the current decision and its history are both true.
-- A new disclosure version has no accepted row until the person chooses again.

CREATE TABLE IF NOT EXISTS ai_data_sharing_consents (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  disclosure_version TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('accepted', 'declined', 'withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_data_sharing_consents_current_idx
  ON ai_data_sharing_consents (user_id, disclosure_version, created_at DESC);

ALTER TABLE ai_data_sharing_consents ENABLE ROW LEVEL SECURITY;

-- The backend service role owns this record. There is deliberately no direct
-- client policy: accepting, declining, and withdrawing all pass through the
-- authenticated API so the disclosure version cannot be invented by a client.
