-- Replay approval was built and then scrapped: players go again on their own,
-- so there is no request to hold.
--
-- A new number rather than an edit to 0009. Wrangler records migrations by
-- filename, so rewriting an applied one is a change that never runs — the
-- table would have stayed in production while the file claimed otherwise.
--
-- Safe on a database that never had the table, and on one that did: the rows
-- only ever recorded asks for a feature that no longer exists.
DROP TABLE IF EXISTS replay_request;
