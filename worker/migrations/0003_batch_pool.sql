-- The generated route pool travels with its batch (JSON: RoutePool).
ALTER TABLE batch ADD COLUMN pool TEXT NOT NULL DEFAULT '{"seed":"","routes":[],"relaxed":false,"stats":{"candidates":0,"difficultySums":[],"walkSpreadMs":0}}';
