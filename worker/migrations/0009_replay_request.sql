-- Replaying is organiser-approved, so the ask has to outlive the tap that made
-- it. One row per player: the newest request replaces the last, because a
-- player has at most one outstanding ask.
CREATE TABLE IF NOT EXISTS replay_request (
  player_id       TEXT PRIMARY KEY,
  batch_id        TEXT NOT NULL,
  status          TEXT NOT NULL,
  requested_at_ms INTEGER NOT NULL,
  decided_at_ms   INTEGER
);

-- The organiser console reads this by batch, newest first.
CREATE INDEX IF NOT EXISTS idx_replay_request_batch
  ON replay_request (batch_id, requested_at_ms DESC);
