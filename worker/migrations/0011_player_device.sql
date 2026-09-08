-- Which kind of phone each player used.
--
-- Coarse on purpose: 'ios', 'android' or 'other', decided on the device and
-- sent once at sign-in. The full user-agent string is never stored — it is a
-- fingerprint, and the only question anyone actually asks of it is which of
-- the two platforms to test against next time.
--
-- Null for everyone who signed up before this existed, and for anyone whose
-- browser does not say.
ALTER TABLE player ADD COLUMN device TEXT;
