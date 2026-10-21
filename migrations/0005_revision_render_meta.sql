-- What a revision was sent WITH: app, layout and engine versions and content hashes of the design files at the moment it was
-- marked as sent. The data itself is frozen in `snapshot`; this says how it looked, so a legacy rendering can be reconstructed later.
ALTER TABLE revisions ADD COLUMN render_meta TEXT;
