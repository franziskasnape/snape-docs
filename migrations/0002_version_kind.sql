-- Why a snapshot exists: manual (Save version), auto (periodic checkpoint), status (status change), restore (taken before a restore)
ALTER TABLE document_versions ADD COLUMN kind TEXT NOT NULL DEFAULT 'manual';
