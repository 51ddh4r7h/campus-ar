-- Campus Movie Hunt — schema v1
-- Locations live in code (shared/src/content.ts), not the DB.

CREATE TABLE batch (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',   -- draft | open | closed
  created_at_ms   INTEGER NOT NULL,
  route_pool_seed TEXT NOT NULL,
  par_constants   TEXT NOT NULL                    -- JSON: ParConstants
);

CREATE TABLE player (
  id            TEXT PRIMARY KEY,
  batch_id      TEXT NOT NULL REFERENCES batch(id),
  name          TEXT NOT NULL,
  roster_id     TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  UNIQUE (batch_id, roster_id)
);

CREATE TABLE route (
  player_id     TEXT PRIMARY KEY REFERENCES player(id),
  stops         TEXT NOT NULL,                     -- JSON: [locationId x5]
  par_total_ms  INTEGER NOT NULL,
  leg_par_ms    TEXT NOT NULL                      -- JSON: [ms x5]
);

CREATE TABLE session (
  player_id     TEXT PRIMARY KEY REFERENCES player(id),
  status        TEXT NOT NULL DEFAULT 'not_started', -- not_started | in_progress | complete | flagged
  start_ts_ms   INTEGER,
  end_ts_ms     INTEGER,
  current_level INTEGER NOT NULL DEFAULT 1,
  score_ms      INTEGER
);

CREATE TABLE split (
  player_id    TEXT NOT NULL REFERENCES player(id),
  level        INTEGER NOT NULL,
  location_id  TEXT NOT NULL,
  reached_ts_ms INTEGER NOT NULL,
  split_ms     INTEGER NOT NULL,
  hints_used   INTEGER NOT NULL DEFAULT 0,
  penalty_ms   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, level)
);

CREATE TABLE game_event (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id  TEXT NOT NULL REFERENCES player(id),
  type       TEXT NOT NULL,
  ts_ms      INTEGER NOT NULL,
  payload    TEXT NOT NULL DEFAULT '{}'            -- JSON
);
CREATE INDEX game_event_player ON game_event (player_id, ts_ms);
CREATE INDEX game_event_type ON game_event (type, ts_ms);

CREATE TABLE breadcrumb (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id  TEXT NOT NULL REFERENCES player(id),
  ts_ms      INTEGER NOT NULL,
  lat        REAL NOT NULL,
  lng        REAL NOT NULL,
  accuracy_m REAL NOT NULL
);
CREATE INDEX breadcrumb_player ON breadcrumb (player_id, ts_ms);
