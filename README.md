# snape-docs

Document generator for Snape Art Conservation. v1 builds offers (Angebote); invoices, treatment
reports and other documents will follow as new folders under `src/doctypes/`.

- Runs locally on Cloudflare Workers via `wrangler dev` (D1 = SQLite file, R2 = local folder).
- Data lives in `.wrangler/` (git-ignored: it contains client data). Back it up separately.
- Fonts (Synonym, Amulya) and the seal are in `public/`.

## Run
```
npm install
npm run db:migrate
npm run dev
```

## Adding a new document type
(to be filled in once the offer type is working)
