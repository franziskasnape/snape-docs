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
Done:
- Workers + Hono + D1 (SQLite) + R2 skeleton, generic schema (`migrations/0001_init.sql`)
- House CSS from the existing offers, Paged.js A4 pagination with running header/footer
- Offer document type: info blocks, prose, notes, measures tables with computed hour totals,
  cost paragraph template (DE/EN) with per-offer override, signatures
- Import of the hand-built offers ANG-2026-002/003/004 into the database (`scripts/import-offers.mjs`)
- Print view `GET /documents/:id/print` (use the browser's Save as PDF)

Next: documents API + landing page (open/duplicate/delete sessions), editor with live preview
and autosave, snippet library, standalone HTML export, versions, backup script.

## Run
```
npm install
npm run db:migrate          # creates the local SQLite database
npm run dev                 # http://localhost:8787
```
Seed the three existing offers (needs the original HTML files; client data is not in git):
```
node scripts/import-offers.mjs <offer.html>...
node scripts/load-seed.mjs
```
Then open `http://localhost:8787/documents/1/print`.

## Layout
```
src/core/            shared: types, formatting, i18n, page frame, reusable render blocks
src/doctypes/offer/  the offer document type (schema, render, cost text, labels)
public/              house.css, fonts, seal, Paged.js (served as static assets)
migrations/          D1 schema
scripts/             asset extraction, offer import, seed loading
```
Client data lives in `.wrangler/` and `seed/` (both git-ignored). Back them up separately.

## Adding a new document type
Create `src/doctypes/<type>/` with a schema, a render function composing `core/render/frame`
and the shared blocks, and its own labels; register it with an id and number prefix
(offer = `ANG`). The database tables are generic (`documents.type`, JSON `data`).
