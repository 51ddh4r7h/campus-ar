-- Pause, resume, abandon.
--
-- Elapsed time was pure wall-clock, so a session nobody finished kept counting
-- for days and a pause could only ever have been cosmetic. These two columns
-- make it real: `paused_at_ms` marks an open pause, `paused_total_ms` banks the
-- closed ones, and both are subtracted wherever elapsed time is worked out.
--
-- Existing rows default to zero, which is exactly right: they were never paused.

ALTER TABLE session ADD COLUMN paused_at_ms    INTEGER;
ALTER TABLE session ADD COLUMN paused_total_ms INTEGER NOT NULL DEFAULT 0;
