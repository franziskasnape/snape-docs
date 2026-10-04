# snape-docs — guide for AI coding sessions

Document generator for Snape Art Conservation (offers first; invoices and treatment reports planned).
Cloudflare Workers + Hono + D1 (SQLite) + R2, run locally with `wrangler dev`. Read `docs/DEVELOPMENT.md` for the
architecture and `docs/RUNNING.md` / `docs/DEPLOY.md` for operations.

## Commands

```bash
npm run dev            # http://localhost:8787 (wrangler dev; hot reloads src/ and public/)
npm run typecheck      # tsc --noEmit — run after every TypeScript change
npm run db:migrate     # apply SQL migrations to the LOCAL database
npm run db:query "select …"   # SQL against the local database
npm run backup         # database dump + photos to ~/git/projects/snape-docs-backups/
```

Verify UI changes in a browser; the live preview and History side-by-side only finish rendering while the
browser tab is visible (Paged.js pauses in hidden tabs).

## Rules that matter

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

There is no automated test suite. `public/diff.js` is a plain script that also works under Node (`module.exports`),
so its logic can be tested with a small script. For rendering changes, compare `/documents/N/print` for the imported
offers (ANG-2026-002/003/004) before and after; their totals and cost paragraph should not change.

## Git

Small commits that explain *why*. End commit messages with the `Co-Authored-By` line the session provides.
