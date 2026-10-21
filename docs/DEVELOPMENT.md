# Developing snape-docs

For running the app see [RUNNING.md](RUNNING.md); for hosting see [DEPLOY.md](DEPLOY.md).

## Stack

| Piece | What | Why |
| --- | --- | --- |
| Cloudflare Workers + [Hono](https://hono.dev) | the server (`src/index.ts`, `src/routes/`) | runs locally with `wrangler dev` and deploys unchanged |
| D1 | SQLite database (`migrations/`) | a real SQLite file locally, hosted SQLite on Cloudflare |
| R2 | photo storage | a local folder in development, a bucket on Cloudflare |
| [Vivliostyle](https://vivliostyle.org) | the page-layout engine: splits the HTML into A4 pages in the browser, repeats the running header/footer and table headers, numbers pages. Licence **AGPL-3.0** | `public/vivliostyle.js`, built from `@vivliostyle/core` by `npm install` (`scripts/postinstall.mjs`) |
| Plain HTML + JS | the app UI in `public/` | no build step; edit and reload |

TypeScript is checked with `npm run typecheck`. Tests are described in [Tests](#tests) below.

## How a document is rendered

```
documents row (JSON `data`) + client + artwork lines
        │  parseData(): upgrade old data to the current schema (core/migrate.ts)
        ▼
DocType.render(data, ctx)  ── doctypes/offer/render.ts
        │  composes core/render/frame.ts (letterhead, meta box, footer as running elements)
        │  with core/render/blocks/* (prose, notes, measures table, figures, key/value lines)
        ▼
the DOCUMENT: one plain HTML page + CSS (public/house.css), no scripts, no engine
        │  core/render/host.ts embeds it in a "host" page that lays it out with Vivliostyle
        ▼
host page  ──►  /documents/:id/print           own tab: sheets on a grey desk + Print / Save as PDF button
           ├─►  /api/documents/render          <iframe> in the editor and in History side-by-side (reports "done" to the parent)
           └─►  /documents/:id/standalone.html one file: fonts, photos and the engine inlined
```

The host hands the document to Vivliostyle as a Blob URL (so all URLs inside it are absolute), and shows every page
stacked at true size (Vivliostyle itself shows one page at a time, scaled; `host.ts` has the screen-only CSS that undoes
that). Printing is Vivliostyle's own: it fills `<style id="vivliostyle-page-rules">` with the `@page` rules, so the
browser's *Save as PDF* produces exactly the pages on screen.

**Licence:** Vivliostyle is AGPL-3.0. This repository is public, so its source is available; the standalone HTML export
contains the engine and carries a notice. PDFs are not affected. Keep the notice in `host.ts` when changing it.

The cost summary and the signatures are wrapped in `<section class="final-page">`, which always starts a new page, so every offer ends with one page holding both. (A manual page break as the very last block is ignored so it cannot create a blank page.)

Styling for the printed documents is `public/house.css` (the studio's design, lifted from the original hand-built
offers). The app's own UI uses `public/app.css` and `public/editor.css`.

## Tests

Five suites, all using [Vitest](https://vitest.dev). `npm run test:all` runs everything (about 5 minutes; the app must be running for the API and editor suites). All test data is **invented** (the repository is public, never use real jobs). Suites that talk to the running app create their own throwaway offers and delete only those.

| Command | What it covers | Speed |
| --- | --- | --- |
| `npm test` | about 165 unit tests, no browser (also the private-notes cleaner against attack strings, the word locator, JSON Patch, the schema and frozen samples of every past data version, proofreading against stand-ins for Claude and Claude Code): number/date/CHF formatting, the cost paragraph (hours, CHF, optional treatments, DE/EN), schema migrations, the History diff, offer rendering (final page, localized headings, table structure, photo layout, HTML escaping), the layout host page, backup retention, image sizes, the publish guard (against throwaway git repos) and public-repo hygiene | about 10 s |
| `npm run test:api` | The **HTTP API** against the running app: self-description (OpenAPI, JSON Schema), create with content, validation errors with paths, JSON Patch by id, conflict detection (409), versions, photos, clients, proofreading status, the HTML export without private notes | a few seconds |
| `npm run test:editor` | The **editor page in a real browser** (headless Chrome, running app): double-click in the preview lands on the exact word (second of two equal words, word after a tag, bullet line), spell-check language on every text field, private notes (bullets in typing order, saved, survive a reload, dangerous HTML neutralised), the stale-tab "Changed elsewhere" banner, the Proofread dialog (apply / skip / error messages, with a canned answer), object list ("Apply to all", photos one row each in name order) | about 40 s |
| `npm run test:restore` | **Restoring a snapshot** from before a database change (built from the real migration files) into a temp folder: the database is brought up to date, documents survive, current data is moved aside | about 20 s |
| `npm run test:layout` | **Print layout** with the real layout host (Vivliostyle) in headless Chrome, plus an end-to-end **PDF** check (A4 pages, page numbers, repeated table header, final page): 40 realistic, 16 demanding and 30 text-heavy invented offers, plus special cases (almost empty, one row, trailing/mid page breaks, English). Needs Google Chrome (or `CHROME_PATH`) and `npm install` (builds `public/vivliostyle.js`). Studio fonts are optional but make the results match real documents (`npm run fonts`) | about 2 minutes |

The layout suite checks every printed page for these defects: blank page, content running past the page, a row photo
hanging out of its row, a heading alone at the bottom of a page, the *Total* line alone at the top of a page, a table
continuing on a new page without its column header row, a table row split across two pages, table columns that differ between
tables, a cut signature block, and the
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

Known limitations, deliberately not asserted: a single treatment row taller than about a third of a page leaves a white
gap, because rows are never split across pages. A few lines of content can end up alone on the page before the final page.
Column positions and overflow are compared with a few pixels' tolerance (the engine lays out at a high internal resolution).

How the table is built to satisfy these rules: the treatment table is **one real `<table>`** with a `<thead>`, so the engine
repeats the column header on every continuation page. The last data row and the total line share a `<tbody class="keep-last">`
with `break-inside: avoid`, so the total is never alone at the top of a page. Column widths come from the `<colgroup>`.

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

See **[SCHEMA.md](SCHEMA.md)** for the schema, the versioning rules, when a version bump is needed and the checklist (the notes below are the short version).

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

## API for scripts and agents

See [API.md](API.md). The pieces: `src/doctypes/offer/zod.ts` (the schema every save is checked against and the source of the published JSON Schema),
`src/core/validate.ts` (checks and id filling), `src/core/jsonpatch.ts` (PATCH), `src/core/openapi.ts` (the OpenAPI description),
`scripts/snape.mjs` (command line), `tests/api/` (end-to-end tests against a running app, `npm run test:api`).
The offer data types are derived from `zod.ts` (the one place to add a field); a new endpoint needs an entry in `openapi.ts` and a test in `tests/api/`.
Every saving endpoint bumps `documents.rev`; the editor sends `baseRev` and shows "Changed elsewhere" on a 409.

## Revisions and status

`documents.revision` is the revision being worked on, `documents.status` the status of that revision; every sent revision is a row in `revisions` (migration 0004) holding a frozen snapshot (number, language, client, Objekt lines, data without private notes), the sent date and note, the answer and its date.
Rules are in `core/status.ts` (pure, tested) and `core/revisions.ts` (database): `markSent`, `decide`, `undoDecision`, `unsend`, `startNextRevision`, `applyStatus`. `saveDoc` (routes/documents.ts) decides per save: no content change = nothing; content change on a draft = in place; on sent / declined / withdrawn = `startNextRevision` first (the type's `newRevision` hook resets the date); on accepted = 409 `locked`. Private notes never count as a content change.
A frozen revision renders from its own snapshot (`core/revisionRender.ts`), never from the working copy; a revision above 1 prints a mark through `ctx.revision`. Document types provide `summary(data)` (offer: hours and CHF) for the revision lists.
Editor: `renderStatus`, the dialogs and the Sent versions panel in `public/edit.js`; landing page and `client.html` list revisions. Tests: `tests/unit/status.test.js`, `tests/api/revisions.test.js`, the revisions cases in `tests/editor/editor.test.js`.

## Double-click in the preview → the editor field

The editor preview is rendered with `ctx.sourceMap = true`: every piece of editable text carries `data-src="<editor field path>"` (`src()` in `core/render/source.ts`; also `data-src-html` when the field holds HTML and `data-src-line` for bullet points). Printed output, PDF and the standalone file carry no markers (a test guards this). On a double click `onPreviewDblClick` (`public/edit.js`) reads the selected word and which occurrence of it it is, and `DocLocate.locate` (`public/locate.js`) finds that same occurrence in the field's source text, skipping HTML tags and entities. A path with no field of its own (a standard heading, the calculated cost text) scrolls to the block (`data-bp`) instead.
**When you add editable text to a renderer, wrap it with `src(ctx, '<the editor path>')`** so it can be reached from the preview.

## Private notes

`data.privateNotes` holds small HTML (b, i, u, lists, line breaks; everything else is stripped by `cleanNotes` in `public/edit.js`). The renderers never read it, so it is not in the print view, the PDF or the standalone HTML (`tests/unit/render.test.js` guards this). It travels with the document: history snapshots, backups and *Duplicate* include it.

## Collection offers (object lists)

For a large group of works with little known about each (an "Ersteinschätzung" of 40+ framed objects), an offer uses the
**Object list** block (`core/render/blocks/objects.ts`) instead of a treatment table: one table row per object with photo, number, title,
technique, size, an assessment text and an hour estimate. The assessment text is stored **once** in the block (`defaultText`); a row only
carries its own `text` when it differs. The cost summary can show label/value lines (`cost.style = 'lines'`: rate, estimated effort with
the object count, labour costs) with the text underneath; all figures are calculated from the rows. Text sections can have bullet points
(`bullets`). In the editor: *+ Object list*, *+ Photos* (one row per photo, ordered by file name) and *Apply to all* for the hours.

**Importing an earlier PDF** (one-off, macOS, the app must be running): everything stays under `seed/` (git-ignored; the PDF holds client data).

```bash
node scripts/import-object-pdf.mjs <file.pdf>                                  # rows + photos -> seed/object-list/ (objects.json, images/, text.txt)
# put the intro/closing text and the objects block together into seed/object-list/offer.json (see the header of scripts/load-offer-json.mjs)
node scripts/load-offer-json.mjs seed/object-list/offer.json                   # creates the offer, uploads the photos
```

`import-object-pdf.mjs` expects the earlier layout (A4 landscape, one photo per row, columns photo | No. | title | technique | size | assessment | hours)
and stops with a message when a page does not match.

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
