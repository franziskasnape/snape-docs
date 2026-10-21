-- Issued revisions: marking an offer as sent freezes a permanent copy (revision A, B, C …). Editing a sent offer starts the next revision.
-- documents.revision = the revision being worked on; documents.status = the status of that revision.
ALTER TABLE documents ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

CREATE TABLE revisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id   INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  rev_no        INTEGER NOT NULL,                       -- 1 = A, 2 = B, …
  status        TEXT NOT NULL DEFAULT 'sent',           -- sent | accepted | declined | withdrawn | superseded
  snapshot      TEXT NOT NULL,                          -- JSON: number, lang, title, client, artwork, data exactly as sent
  sent_at       TEXT NOT NULL,                          -- yyyy-mm-dd the revision was sent
  sent_note     TEXT,
  decided_at    TEXT,                                   -- yyyy-mm-dd of the client's answer (accepted / declined / withdrawn)
  decided_note  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (document_id, rev_no)
);
CREATE INDEX idx_revisions_document ON revisions(document_id, rev_no);
