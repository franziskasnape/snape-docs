# snape-docs

Document generator for Snape Art Conservation.

## Goal
A local web tool to create client documents in the house design, keep them as editable
"sessions" in SQLite, and export them as PDFs. **Offers (Angebote) come first**; invoices
(with Swiss QR bill), treatment reports and other documentation will follow as new document
types. Every document can be produced in German or English, with a bilingual library of
reusable text snippets (measure rows, artist bios).

It runs locally now and is built on Cloudflare Workers + D1 + R2, so it can be deployed to
Cloudflare later without a rewrite.

## Status
Working:
- Local app on Cloudflare Workers + Hono + D1 (SQLite) + R2; generic schema for all document types
- **Landing page** (`/`): list, search, filter, new offer (DE/EN, client), duplicate, delete
- **Editor** (`/edit.html?id=…`): form + live Paged.js preview, autosave, status, version history
  (named snapshots, automatic checkpoints, status changes; History panel shows what a restore would change),
  photo upload (resized to max 1600 px JPEG in the browser; originals stay in Google Drive)
- **Offer document type**: object/client info, text sections, notes, treatment tables with computed
  hour totals, optional treatments, calculated cost paragraph (DE/EN) with toggles, signatures
- **Snippet library** (`/snippets.html`): bilingual treatment rows and artist bios, insert from the editor
- **Settings** (`/settings.html`): hourly rate, offer validity, default language
- **Export**: `Print / PDF` (browser Save as PDF, correct filename) and `Download HTML` (single file)
- **Backup**: `npm run backup` (database dump + images, outside the repo)
- Existing offers ANG-2026-002/003/004 imported

Ideas / next: orphaned-image cleanup, one-click PDF via Cloudflare Browser Rendering,
invoice (with Swiss QR bill) and treatment-report document types, deploy to Cloudflare (+ Access for login).

## Run
```
npm install
npm run db:migrate          # creates the local SQLite database
npm run dev                 # http://localhost:8787
```
Starter snippet library (German + English drafts, marked "needs review"), with the app running:
```
npm run seed:snippets
```
Import existing hand-built offers (needs the original HTML files; client data is not in git):
```
node scripts/import-offers.mjs <offer.html>...
node scripts/load-seed.mjs
```
Back up (database + images) to `~/git/projects/snape-docs-backups/<timestamp>`:
```
npm run backup
```

## Layout
```
src/core/            shared: types, formatting, i18n, page frame, reusable render blocks
src/doctypes/offer/  the offer document type (schema, render, cost text, labels)
public/              house.css, fonts, seal, Paged.js (served as static assets)
migrations/          D1 schema
scripts/             asset extraction, offer import, snippet seed, backup
src/routes/          documents, clients, images, snippets, settings API
```
Client data lives in `.wrangler/` and `seed/` (both git-ignored). Back them up separately.

## Adding a new document type
Create `src/doctypes/<type>/` with a schema, a render function composing `core/render/frame`
and the shared blocks, and its own labels; register it with an id and number prefix
(offer = `ANG`). The database tables are generic (`documents.type`, JSON `data`).
