-- Password login. `roster_id` (the roll number) is the username; players now
-- set a password against it instead of following a one-time link. The magic
-- link still works — this is an additional way in, not a replacement.
--
-- `event_code` is the short per-batch code the shared URL carries (/?e=<code>),
-- so one link serves the whole cohort. Unique where set; older batches keep NULL
-- and simply have no self-serve signup.

ALTER TABLE player ADD COLUMN password_hash TEXT;
ALTER TABLE batch  ADD COLUMN event_code    TEXT;

CREATE UNIQUE INDEX batch_event_code ON batch (event_code) WHERE event_code IS NOT NULL;
CREATE INDEX player_batch_roster ON player (batch_id, roster_id);
