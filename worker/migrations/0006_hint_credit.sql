-- The rung-3 free hint, spent once per hunt rather than per level.
ALTER TABLE session ADD COLUMN hint_credit_used INTEGER NOT NULL DEFAULT 0;
