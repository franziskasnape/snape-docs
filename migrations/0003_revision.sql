-- Revision counter: +1 on every save. Clients (the editor, scripts, agents) send the revision they last read as `baseRev` / If-Match,
-- and a save based on an older revision is refused instead of silently overwriting someone else's change.
ALTER TABLE documents ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;
