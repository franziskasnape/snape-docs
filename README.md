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
npm run db:migrate       # first time only: creates the local database
npm run dev              # starts the app at http://localhost:8787
```

Open <http://localhost:8787>. Stop the server with `Ctrl+C` in the terminal where it runs.

## Documentation

| Guide | What's in it |
| --- | --- |
| [docs/RUNNING.md](docs/RUNNING.md) | Install, start/stop, where your data lives, backup and restore, troubleshooting |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Deploy to Cloudflare, protect it with a login, move your data, update later |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Architecture, adding a document type, changing the data shape, conventions |
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

## Project layout

```
src/core/            shared: types, formatting, i18n, migrations, page frame, reusable render blocks
src/doctypes/offer/  the offer document type (schema, render, cost text, labels, migrations)
src/routes/          API: documents, clients, images, snippets, settings
public/              the app UI (landing, editor, snippets, settings), house.css, fonts, seal, Paged.js, diff.js
migrations/          D1 database schema (applied in order)
scripts/             import offers, seed snippets, backup, copy images, extract assets
docs/                the guides above
```

## Privacy

Client data (names, addresses, photos) lives in `.wrangler/` and `seed/`, both **git-ignored**. Backups are written
outside the repository. The repository itself contains no client data.
