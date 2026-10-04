# Deploying snape-docs to Cloudflare

> **Status:** the app is built on Cloudflare's own runtime and storage (Workers, D1, R2), and the local server
> uses the same code. The commands below follow Cloudflare's documented workflow, and the data-moving steps
> (export, import, image copy) were tested against local scratch databases. **The deploy itself has not yet been run
> against a real Cloudflare account.** Expect to adjust a menu name or two in the dashboard, and fix this
> document as you go.

## Read this first: protect it before it holds real data

The app has **no login of its own**. Anyone who knows the address could open every offer, client name and photo.
Before you put real client data online, put **Cloudflare Access** (a login in front of the whole site) in front of it,
as described in step 6. Do step 6 *before* step 5's data transfer, or deploy with the public address switched off
(see "Keeping the address private").

## What you need

- A Cloudflare account (free is fine to start) at <https://dash.cloudflare.com>
- **R2** enabled on the account (Dashboard → R2). Cloudflare may ask for a payment method even though the free tier
  (about 10 GB, no download fees at the time of writing) is far more than a few thousand photos need
- Node.js and this project set up as in [RUNNING.md](RUNNING.md)
- Optionally a domain managed by Cloudflare, if you want an address like `docs.yourdomain.ch`

Rough running cost for a one-person studio: **CHF 0** on the free plans, see "Limits and cost" below.

## 1. Log in

```bash
cd ~/git/projects/snape-docs
npx wrangler login          # opens the browser to authorise
npx wrangler whoami         # shows the account it will deploy to
```

## 2. Create the database and the photo bucket

```bash
npx wrangler d1 create snape-docs
```

This prints a block containing a **`database_id`**. Copy that id into `wrangler.jsonc`, replacing
`local-only-replace-on-deploy`:

```jsonc
"d1_databases": [
  { "binding": "DB", "database_name": "snape-docs", "database_id": "PASTE-THE-ID-HERE", "migrations_dir": "migrations" }
],
```

Create the bucket (the name must match `wrangler.jsonc`):

```bash
npx wrangler r2 bucket create snape-docs-images
```

The database id is not a secret; it is fine to commit.

## 3. Create the tables in the hosted database

```bash
npx wrangler d1 migrations apply DB --remote
```

## 4. Deploy

```bash
npm run deploy
```

Wrangler prints the address, something like `https://snape-docs.<your-subdomain>.workers.dev`.
Open it: the document list should load (empty at this point).

## 5. Move your local documents and photos (optional)

Skip this if you start fresh online. The **hosted data is separate from your local data**; nothing syncs by itself.

```bash
# 1. back up first, always
npm run backup -- --force

# 2. export the local data (rows only, not the table definitions), and make it safe to re-run
npx wrangler d1 export DB --local --no-schema \
  --table clients --table artworks --table documents --table images \
  --table snippets --table settings --table document_versions \
  --output /tmp/snape-data.sql
sed -i '' 's/^INSERT INTO/INSERT OR REPLACE INTO/' /tmp/snape-data.sql      # macOS sed

# 3. load it into the hosted database
npx wrangler d1 execute DB --remote --file /tmp/snape-data.sql

# 4. copy the photos from the local store into the hosted bucket
node scripts/copy-images.mjs --remote
```

Then open the hosted address and check the document list, open an offer, and look at its photos.
(Tested locally: the export/import reproduced the same row counts, and ids continue correctly. The image copy copied
19 of 19 photos into a scratch store byte-for-byte. Not yet tested against real R2.)

`/tmp/snape-data.sql` contains client data: delete it afterwards (`rm /tmp/snape-data.sql`).

## 6. Put a login in front (Cloudflare Access)

Cloudflare Access is free for small teams (up to 50 users at the time of writing). Two ways, pick one:

**A. On the `workers.dev` address (simplest).** Dashboard → Workers & Pages → `snape-docs` → Settings →
Domains & Routes → next to the `workers.dev` route choose **Enable Cloudflare Access**, then in the policy allow only
your e-mail address. Visitors then get a one-time-code or Google login page before they see anything.

**B. On your own domain.** Add a custom domain to the Worker (Settings → Domains & Routes → Add → Custom domain, e.g.
`docs.yourdomain.ch`), then Zero Trust → Access → Applications → Add an application → *Self-hosted*, enter that
address, and add a policy **Allow → Emails → your address**. Optionally disable the `workers.dev` address in the same
screen so there is only one way in.

After setting it up, open the address in a private window: you must be asked to log in. **Do not skip this check.**
If it opens straight away, it is public.

### Keeping the address private until Access is ready

To deploy without any public address, set this in `wrangler.jsonc` before the first `npm run deploy`:

```jsonc
"workers_dev": false,
"preview_urls": false
```

The Worker then has no reachable address until you attach a custom domain (option B). Remove these two lines later if
you want the `workers.dev` address back.

## 7. Updating later

Whenever the code changes (new features, bug fixes):

```bash
git pull                      # if the code comes from a remote; otherwise you already have it
npm install
npx wrangler d1 migrations apply DB --remote     # only does something if there are new migrations
npm run deploy
```

**Always apply migrations before deploying** the code that needs them. Migrations are in `migrations/` and are applied
in order, once each. Changes to the *shape of document data* are handled by the app itself when a document is opened
(see [DEVELOPMENT.md](DEVELOPMENT.md#changing-the-shape-of-document-data)); they need no database migration.

## 8. Backups of the hosted data

- **Database:** `npx wrangler d1 export DB --remote --output ~/backup-$(date +%F).sql` (full dump, schema and data).
  D1 also keeps a rolling history that can be restored to a point in time (*Time Travel*, about 30 days); see
  Cloudflare's D1 documentation for `wrangler d1 time-travel`.
- **Photos:** they live in the R2 bucket. Originals are in Google Drive, so the bucket only holds the resized copies;
  to download them, use the Cloudflare dashboard or `wrangler r2 object get`.
- Keep doing `npm run backup` for your *local* data for as long as you use the local copy.

## 9. Local vs hosted: which one is "the truth"?

They are two separate databases. Pick one place to work. If you move to the hosted version for good, treat the local
one as an archive (and make a last backup of it). Merging edits made in both places is not supported.

## Limits and cost (check Cloudflare's current pricing pages)

- **Workers free plan:** a generous number of requests per day, but only a few milliseconds of CPU per request.
  Normal pages are far below that. The **Download HTML** export builds a 1–2 MB file (it embeds fonts, photos and the
  page-layout script) and is the one request that might hit the CPU limit on the free plan. If it fails there with an
  error, the cheapest fix is the Workers *Paid* plan (about USD 5 per month); everything else keeps working.
  Print / PDF does not use this route.
- **D1 free plan:** several GB of storage and millions of reads per day; this app uses a few megabytes.
- **R2 free tier:** about 10 GB of storage and a generous number of operations; no charge for downloads.

## Removing everything

```bash
npx wrangler delete                         # removes the Worker
npx wrangler d1 delete snape-docs           # deletes the hosted database and all its data
npx wrangler r2 bucket delete snape-docs-images   # the bucket must be empty first
```

These cannot be undone. Make a backup first.
