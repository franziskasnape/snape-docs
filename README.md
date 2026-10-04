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
- **Version history**: named snapshots, automatic checkpoints every 10 minutes of editing, status changes;
  a History panel with a change list, side-by-side preview and safe restore
- **Snippet library** (`/snippets.html`): bilingual treatment rows and artist bios, inserted from the editor
- **Settings** (`/settings.html`): hourly rate, offer validity, default language
- **Export**: *Print / PDF* (use the browser's Save as PDF) and *Download HTML* (one self-contained file)
- **Backup**: `npm run backup`, optional hourly automatic backups, `npm run restore`
- **Tests**: `npm test` (67 unit tests) and `npm run test:layout` (print layout and PDF export in headless Chrome)

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
