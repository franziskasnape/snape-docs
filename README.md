# snape-docs

Document generator for **Snape Art Conservation**. Create client documents in the studio's house design,
keep them as editable sessions in a SQLite database, and export them as PDFs.

**Offers (Angebote) are built.** Invoices (with Swiss QR bill), treatment reports and other documents will follow
as new document types. Every document can be written in **German or English**.

It runs locally today on Cloudflare's Workers runtime (`wrangler dev`) and can be deployed to Cloudflare later
without a rewrite (D1 = SQLite, R2 = image storage).

## Quick start

```bash
cd ~/git/projects/snape-docs
npm install              # first time only
npm run fonts -- "<folder with the downloaded Synonym + Amulya fonts>"   # first time only; fonts are not in the repo
npm run db:migrate       # first time only: creates the local database
npm run dev              # starts the app at http://localhost:8787
```

Open <http://localhost:8787>. Stop the server with `Ctrl+C` in the terminal where it runs.

## Documentation

| Guide | What's in it |
| --- | --- |
| [docs/RUNNING.md](docs/RUNNING.md) | Install, start/stop, where your data lives, backup and restore, troubleshooting |
| [docs/SCHEMA.md](docs/SCHEMA.md) | **Document schema and versioning**: what is validated, when to bump the version, migrations and frozen samples |
| [docs/API.md](docs/API.md) | **HTTP API and command line for scripts and AI agents**: OpenAPI, JSON Schema, JSON Patch, conflict detection |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Deploy to Cloudflare, protect it with a login, move your data, update later |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Architecture, **tests**, adding a document type, changing the data shape, conventions |
| [docs/PUBLISHING.md](docs/PUBLISHING.md) | **This repository is public**: what must never be committed, the publish guard, new-computer setup |
| [CLAUDE.md](CLAUDE.md) | Short project guide for AI coding sessions |

## What it does

- **Landing page** (`/`): list, search and filter documents; new offer (DE/EN, client); duplicate; delete
- **Editor** (`/edit.html?id=…`): form with live A4 preview, autosave, status, photo upload
  (resized in the browser to max 1600 px JPEG; originals stay in Google Drive)
- **Offer type**: object and client info, text sections, notes, treatment tables with calculated hour totals,
  optional treatments, calculated cost paragraph (DE/EN), signatures, portrait/landscape overview photo
- **Double-click to edit**: double-click a word in the live preview and the editor jumps to that field and selects the exact word (headings and calculated text jump to their block)
- **Private notes**: a small rich-text box (bold, italic, bullet and numbered lists) at the top of the editor, saved with the offer, in its history and in backups, and never printed or exported
- **Collection offers**: an *Object list* block (photo, number, title, technique, size, shared assessment text, hours per object), bullet lists, and a cost summary as rate / effort / cost lines; `scripts/import-object-pdf.mjs` reads an earlier PDF into it
- **API for scripts and agents**: everything the editor does is available over HTTP and as `npm run snape -- <command>` (create/read/edit/delete, photos, PDF, history), with OpenAPI and JSON Schema, validation errors with paths, and revision checks
- **Proofreading**: spell check in the offer's language while typing, and a **Proofread** button (Claude) that suggests corrections you accept one by one; works with your own Claude login (no API cost) or an API key; house rules and glossary in Settings
- **Sent revisions**: marking an offer as sent freezes a permanent copy (Revision A, B, C…) with its date; changing a sent offer starts the next revision, accepted offers are locked until you create an amendment, statuses are draft / sent / accepted / declined / withdrawn; a **Sent versions** panel and a per-client page show everything that was offered, and any revision can be printed exactly as it was sent
- **Version history**: named snapshots, automatic checkpoints every 10 minutes of editing, status changes;
  a History panel with a change list, side-by-side preview and safe restore
- **Snippet library** (`/snippets.html`): bilingual treatment rows and artist bios, inserted from the editor
- **Settings** (`/settings.html`): hourly rate, offer validity, default language, your signature (background and baked-in baseline are removed automatically) and place of signing
- **Signed last page**: the contractor line is pre-filled with "Wollerau, <offer date>" and your signature standing on the line (switch off per offer)
- **Export**: *Print / PDF* (use the browser's Save as PDF) and *Download HTML* (one self-contained file)
- **Backup**: `npm run backup`, optional hourly automatic backups, `npm run restore`
- **Tests**: `npm test` (unit), `npm run test:api`, `npm run test:editor` (the editor in a real browser), `npm run test:restore`, `npm run test:layout` (print layout and PDF export in headless Chrome); `npm run test:all` runs all of them

## Project layout

```
src/core/            shared: types, formatting, i18n, migrations, page frame, reusable render blocks
src/doctypes/offer/  the offer document type (schema, render, cost text, labels, migrations)
src/routes/          API: documents, clients, images, snippets, settings
public/              the app UI (landing, editor, snippets, settings), house.css, fonts, seal, diff.js (the Vivliostyle layout engine is built into public/ by npm install)
migrations/          D1 database schema (applied in order)
scripts/             import offers, seed snippets, backup/restore, fonts, git guard, copy images, extract assets
tests/               unit tests and print-layout tests (invented data only)
docs/                the guides above
```

## Third-party software

- **[Vivliostyle](https://vivliostyle.org)** (page layout and printing) — GNU AGPL-3.0. Built into `public/vivliostyle.js` by `npm install`;
  the standalone HTML export includes it with a notice.
- **Synonym** and **Amulya** fonts — Fontshare EULA; not in this repository, install with `npm run fonts`.
- Hono, Wrangler, Vitest, Puppeteer, pdf.js and other npm packages under their own licences (see `package-lock.json`).

## Privacy

This repository is **public** and contains code only. Client data (names, addresses, photos), your full snippet
library and the fonts live outside it (`.wrangler/`, `seed/`, `public/fonts/`: all git-ignored); backups are written to
Google Drive. See [docs/PUBLISHING.md](docs/PUBLISHING.md) for the rules and the automatic push guard.
