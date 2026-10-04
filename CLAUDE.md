# snape-docs — guide for AI coding sessions

Document generator for Snape Art Conservation (offers first; invoices and treatment reports planned).
Cloudflare Workers + Hono + D1 (SQLite) + R2, run locally with `wrangler dev`. Read `docs/DEVELOPMENT.md` for the
architecture and `docs/RUNNING.md` / `docs/DEPLOY.md` for operations.

## Commands

```bash
npm run dev            # http://localhost:8787 (wrangler dev; hot reloads src/ and public/)
npm run typecheck      # tsc --noEmit — run after every TypeScript change
npm test               # 60 fast unit tests (~10 s)
npm run test:layout    # print-layout tests in headless Chrome (~2 min) — run after ANY change to house.css / render code
npm run db:migrate     # apply SQL migrations to the LOCAL database
npm run db:query "select …"   # SQL against the local database
npm run backup         # snapshot (db dump + photos) to the folder in .backup-dir, default ~/git/projects/snape-docs-backups/
npm run restore -- latest     # restore a snapshot (stop the dev server first; current data is kept aside)
```

Fonts and `public/paged.polyfill.js` are not in git (`npm run fonts`, `npm install`).

Verify UI changes in a browser; the live preview and History side-by-side only finish rendering while the
browser tab is visible (Paged.js pauses in hidden tabs).

## Rules that matter

- **This repository is PUBLIC on GitHub.** Code only. Never commit client names, piece details (artists, titles,
  conditions), photos/images (except `public/seal.png`), exports, databases, fonts, keys, or text copied from real offers
  — not in code, docs, comments, tests, fixtures, screenshots or commit messages. Use invented placeholder data in
  examples and tests. Read `docs/PUBLISHING.md`; the pre-push guard (`scripts/pre-push-guard.sh`) enforces part of this.

- **The editor UI is English; generated documents are German or English.** Printed labels are keys translated at
  render time (`src/doctypes/*/i18n.ts`); never hard-code German into `public/edit.js` or other UI text.
- **Never type computed numbers** (hour totals, CHF). They come from `doctypes/offer/cost.ts` and the measures block.
- **Document data has a schema version** (`data.v`). Adding an optional field is free; renaming/restructuring needs a
  migration in the doc type (`migrations.ts`) plus a `schemaVersion` bump. Never rewrite stored history snapshots;
  they are upgraded on read.
- **Blocks, rows and photos need a stable `id`** (`uid()`); the History diff matches by id.
- **Database tables change only through a new numbered file in `migrations/`.** Never edit an applied migration.
- **Client data must not enter git.** `.wrangler/`, `seed/` and backups are git-ignored or outside the repo. Do not
  commit exports, photos, or screenshots of real client documents.
- New document types go in `src/doctypes/<type>/`, registered in `src/core/registry.ts`; reuse `src/core/render/blocks`.
- Don't move an `<iframe>` in the DOM (it reloads); the preview swaps frames by visibility.
- The deployed app has no login of its own — it must sit behind Cloudflare Access (see `docs/DEPLOY.md`).

## Testing notes

`npm test` and `npm run test:layout` (see `docs/DEVELOPMENT.md#tests`). Use them: run the unit tests after logic changes
and the layout tests after any change to `public/house.css`, `src/core/render/**` or `src/doctypes/*/render.ts`. When fixing
a layout bug, add a failing variant/check first. All fixtures are invented (`tests/layout/fixtures.js`); never put real
client or piece data in a test. `public/diff.js` is a plain browser script that publishes `globalThis.DocDiff`.
Layout tests launch headless Chrome with a temporary profile (no window); they skip themselves if Chrome is not found.

## Git

Small commits that explain *why*. End commit messages with the `Co-Authored-By` line the session provides.
