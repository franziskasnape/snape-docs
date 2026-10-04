-- Generic document tables. Document types (offer, later invoice/report) live in `documents.type`;
-- type-specific content is in the `data` JSON column.

CREATE TABLE clients (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  address    TEXT,
  contact    TEXT,
  phone      TEXT,
  email      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE artworks (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id         INTEGER REFERENCES clients(id),
  fields            TEXT NOT NULL DEFAULT '[]',   -- JSON [{k, v}] (Objekt lines)
  overview_image_id INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE documents (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,                       -- 'offer' | 'invoice' | 'report' ...
  number     TEXT NOT NULL UNIQUE,                -- e.g. ANG-2026-004
  lang       TEXT NOT NULL DEFAULT 'de' CHECK (lang IN ('de','en')),
  status     TEXT NOT NULL DEFAULT 'draft',
  client_id  INTEGER REFERENCES clients(id),
  artwork_id INTEGER REFERENCES artworks(id),
  parent_id  INTEGER REFERENCES documents(id),    -- e.g. invoice -> offer
  title      TEXT,
  data       TEXT NOT NULL DEFAULT '{}',          -- JSON, shape defined by the doc type
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_documents_type ON documents(type, updated_at DESC);

CREATE TABLE images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  artwork_id  INTEGER REFERENCES artworks(id),
  r2_key      TEXT NOT NULL,
  mime        TEXT NOT NULL,
  width       INTEGER,
  height      INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE snippets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL,                     -- 'measure' | 'artist' | ...
  key          TEXT NOT NULL,
  de           TEXT NOT NULL DEFAULT '{}',        -- JSON
  en           TEXT NOT NULL DEFAULT '{}',        -- JSON
  needs_review INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (kind, key)
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                             -- JSON
);
INSERT INTO settings (key, value) VALUES
  ('hourly_rate', '100'),
  ('validity_days', '90'),
  ('default_lang', '"de"');

CREATE TABLE document_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  data        TEXT NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
