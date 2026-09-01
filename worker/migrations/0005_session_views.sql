-- Viewings of the scene on the current level. Two are free per level; past that
-- each one adds time, so the count has to live where the score is computed.
ALTER TABLE session ADD COLUMN current_level_views INTEGER NOT NULL DEFAULT 0;
