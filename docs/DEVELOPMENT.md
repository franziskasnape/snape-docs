# Developing snape-docs

For running the app see [RUNNING.md](RUNNING.md); for hosting see [DEPLOY.md](DEPLOY.md).

## Stack

| Piece | What | Why |
| --- | --- | --- |
| Cloudflare Workers + [Hono](https://hono.dev) | the server (`src/index.ts`, `src/routes/`) | runs locally with `wrangler dev` and deploys unchanged |
| D1 | SQLite database (`migrations/`) | a real SQLite file locally, hosted SQLite on Cloudflare |
| R2 | photo storage | a local folder in development, a bucket on Cloudflare |
| [Paged.js](https://pagedjs.org) | splits the HTML into A4 pages in the browser, repeats header/footer, numbers pages | `public/paged.polyfill.js` (copied from the npm package) |
| Plain HTML + JS | the app UI in `public/` | no build step; edit and reload |

TypeScript is checked with `npm run typecheck`. Tests are described in [Tests](#tests) below.

## How a document is rendered

```
documents row (JSON `data`) + client + artwork lines
        │  parseData(): upgrade old data to the current schema (core/migrate.ts)
        ▼
DocType.render(data, ctx)  ── doctypes/offer/render.ts
        │  composes core/render/frame.ts (letterhead, meta box, footer, Paged.js)
        │  with core/render/blocks/* (prose, notes, measures table, figures, key/value lines)
        ▼
one HTML string  ──►  /documents/:id/print          (browser + Paged.js)
                 ├─►  /documents/:id/standalone.html (fonts, photos, script inlined)
                 └─►  /api/documents/render          (editor live preview and History side-by-side)
```

The cost summary and the signatures are wrapped in `<section class="final-page">`, which always starts a new page, so every offer ends with one page holding both. (A manual page break as the very last block is ignored so it cannot create a blank page.)

Styling for the printed documents is `public/house.css` (the studio's design, lifted from the original hand-built
offers). The app's own UI uses `public/app.css` and `public/editor.css`.

## Tests

Two suites, both using [Vitest](https://vitest.dev). All test data is **invented** (the repository is public, never use real jobs).

| Command | What it covers | Speed |
| --- | --- | --- |
| `npm test` | 60 unit tests, no browser: number/date/CHF formatting, the cost paragraph (hours, CHF, optional treatments, DE/EN), schema migrations, the History diff, offer rendering (final page, localized headings, table structure, photo layout, HTML escaping), backup retention, image sizes, the publish guard (against throwaway git repos) and public-repo hygiene | about 10 s |
| `npm run test:layout` | **Print layout** with the real page-layout engine (Paged.js) in headless Chrome: 40 realistic, 16 demanding and 30 text-heavy invented offers, plus special cases (almost empty, one row, trailing/mid page breaks, English). Needs Google Chrome (or `CHROME_PATH`) and `npm install` (copies Paged.js into `public/`). Studio fonts are optional but make the results match real documents (`npm run fonts`) | about 2 minutes |

The layout suite checks every printed page for these defects: blank page, content running past the page, a row photo
hanging out of its row, a heading alone at the bottom of a page, the *Total* line alone at the top of a page, a table
row split across two pages, table columns that differ between pieces of the same table, a cut signature block, and the
**final-page rule** (cost summary and both signature rows together on the last page, nowhere else). It also fails when
pages in the middle are mostly empty for realistic content. Each variant uses different text lengths so that page
breaks fall in many different places; a bug that only appears when a heading lands at the very bottom is found by
sheer variety, not luck.

When you change layout code (`public/house.css`, `src/core/render/**`, `src/doctypes/*/render.ts`) run `npm run test:layout`.
When you fix a layout bug, first add a variant or a check that fails because of it, then fix it. To *see* a page:

```js
// inside any layout test: also writes page-1.png, page-2.png, … to the folder
await h.render(makeOffer({ seed: 11, rows: 15 }), 'de', { screenshotDir: '/tmp/pages' });
```

Known limitations, deliberately not asserted: Paged.js cannot repeat a table's header row on continuation pages
(`it.todo` in `tests/layout/layout.test.js`), and a single treatment row taller than about a third of a page leaves a white
gap, because rows are never split across pages. A few lines of content can end up alone on the page before the final page.

How the table is built to satisfy these rules: the treatment table is written as up to three pieces that look like one
table, `[heading + header + first row]`, `[middle rows]`, `[last row + total line]`, because Paged.js honours
`break-inside: avoid` on a wrapper but cannot "keep with next" across table rows. Column widths are set on the cells
(not only a `<colgroup>`), because Paged.js drops the `colgroup` when it splits a table.

## Code map

```
src/index.ts                 app wiring, /img/:id, print + standalone routes
src/core/types.ts            DocType interface, RenderContext, Settings
src/core/registry.ts         list of document types (register new ones here)
src/core/db.ts               D1 helpers: settings, numbering, image sizes, parseData
src/core/migrate.ts          schema versioning: upgrade(), uid()
src/core/format.ts, i18n.ts  number/date/CHF formatting, shared German/English labels
src/core/render/             frame.ts, blocks/*.ts
src/doctypes/offer/          schema.ts, render.ts, cost.ts, i18n.ts, migrations.ts
src/routes/                  documents.ts (CRUD, versions, render), clients.ts, images.ts, snippets.ts, settings.ts
public/edit.js, edit.html    the editor (form, autosave, live preview, History)
public/diff.js               block-aware diff used by History
```

## Conventions

- **The editor UI is always English.** German/English only appears in the generated document. Labels that print are
  stored as keys (e.g. `headingKey: 'artist'`) and translated at render time from `doctypes/*/i18n.ts`.
  User-written content (descriptions, paragraphs) is stored as typed, in the document's language.
- **Computed numbers are never typed.** Hour totals, CHF ranges and the cost paragraph come from the treatment tables
  (`doctypes/offer/cost.ts`). A manual cost text (`cost.overrideHtml`) is an escape hatch and does not update.
- **Blocks, rows and photos have stable `id`s** so history can tell "moved" from "edited" from "deleted".
  Anything the editor creates gets an id (`uid()` in `edit.js`).
- **Timestamps in the database are UTC;** the UI converts to local time.
- **Client data stays out of git** (`.wrangler/`, `seed/`, backups outside the repo).
- Commit messages explain *why*; one logical change per commit.

## Adding a new document type (invoice, treatment report, …)

1. Create `src/doctypes/<type>/` with the same shape as `offer/`: `schema.ts` (data type), `render.ts`
   (an exported `DocType`: `id`, `prefix` for the number such as `RE`, `labels`, `statuses`, `schemaVersion`,
   `migrations`, `defaultData`, `defaultArtwork`, `render`), `i18n.ts` (its labels in German and English).
2. Reuse `core/render/frame.ts` and the blocks in `core/render/blocks/`; add new shared blocks there (for an invoice,
   a Swiss QR bill block; for a report, a before/after figure block).
3. Register it in `src/core/registry.ts`.
4. The API, numbering (`RE-2026-001`), landing page and print/standalone routes already work for any registered type.
   The landing page's **New offer** button and the editor's form are still offer-specific: extend `public/index.html`
   (a "New" button per type) and `public/edit.js` (the block list for the type's form).
5. Document anything unusual in this file.

## Changing the shape of document data

Document `data` carries a schema version, `data.v` (missing means 1). The current version of a type is
`schemaVersion` on its `DocType`; the offer is at **2** (v2 added stable ids).

- **Adding an optional field:** nothing to do. Old documents and history snapshots lack it; code falls back to a default.
- **Renaming, moving or restructuring a field:**
  1. Append a function to the type's `migrations` array (`doctypes/offer/migrations.ts`; index *i* upgrades *i+1 → i+2*).
     It receives the old data and returns the new data. It must be deterministic (same input → same output).
  2. Increase `schemaVersion` and make `defaultData` produce the new shape.
  3. Done. `parseData()` upgrades data whenever it is loaded; the first time a document is opened the upgrade is saved.
- **History snapshots are never rewritten.** They are upgraded on read (when listing changes, rendering, or restoring),
  so old versions keep working. Never edit stored snapshots by hand.
- Changes to **database tables** are different: add a new numbered SQL file in `migrations/`
  (`0003_description.sql`, never edit an applied one), apply with `npm run db:migrate` locally and
  `npx wrangler d1 migrations apply DB --remote` when deploying.

## Version history

- Snapshots are rows in `document_versions` with a `kind`: `manual` (Save version), `auto` (checkpoint, at most one per
  10 minutes of editing, the last 100 kept), `status` (status changed), `restore` (taken before a restore).
- A snapshot stores title, status, client id, object lines and the full `data`.
- Restoring first saves the current state as a `restore` snapshot, so it can be undone.
- `public/diff.js` compares *current → version*: blocks, rows and photos by `id`, paragraphs and object lines by
  longest-common-subsequence, text word by word. Tags: changed, brought back, removed, moved.
- Not done yet: restoring single changes, highlighting changed areas in the pages, freezing what was actually sent.

## Photos

The browser shrinks every upload (max 1600 px, JPEG quality 0.82) before sending it to `POST /api/images`; the server
rejects anything over 6 MB. Pixel sizes are read from the file once and stored (used for the portrait/landscape
layout). Photos nobody references any more are not deleted yet (no cleanup job).

## Known gaps / ideas

- Per-change restore from History; highlighting of changes in the side-by-side pages
- Freezing the rendered file and client details when an offer is marked *sent*
- Clean-up of unused photos
- Invoice (Swiss QR bill) and treatment-report document types
- One-click PDF download on Cloudflare (Browser Rendering) instead of the browser's Save as PDF
- Offers imported from the old files have typed-in headings, not the standard section keys
