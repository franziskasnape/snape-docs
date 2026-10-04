# Running snape-docs locally

Everything here is for your own computer. For putting the app on the internet see [DEPLOY.md](DEPLOY.md).

## 1. One-time setup

**Node.js** (v20 or newer; v24 is installed on this Mac) provides `node` and `npm`. Check with:

```bash
node -v && npm -v
```

If it is missing, install the **macOS Installer (.pkg)** from <https://nodejs.org/en/download>
(on an Intel Mac pick the x64 build). Homebrew cannot install Node on Intel Macs any more, so use the installer.
Open a *new* terminal afterwards.

Then, in the project folder:

```bash
cd ~/git/projects/snape-docs
npm install              # downloads the dependencies
npm run db:migrate       # creates the local SQLite database and its tables
```

Optional, with the app running (see below):

```bash
npm run seed:snippets    # loads the starter library: 24 treatment rows + 2 artist bios, German and English
```

The English wording in the starter library is a draft and is marked **needs review** on the Snippets page.

## 2. Start and stop

```bash
npm run dev
```

The app is then at **<http://localhost:8787>**. Leave the terminal window open while you work.

- **Stop:** press `Ctrl+C` in that terminal.
- **Restart:** stop it and run `npm run dev` again. Nothing is lost; the data is saved on disk.
- **Code changes** are picked up automatically while the server runs. Reload the browser page.
- **If the terminal was closed** and the server keeps running in the background, stop it with:

  ```bash
  pkill -f "wrangler dev"
  ```

- **Port already in use:** another copy is running. Use the `pkill` command above, or start on another port
  with `npx wrangler dev --port 8788`.

## 3. Pages

| Address | What it is |
| --- | --- |
| `/` | Document list: search, filter, new offer, duplicate, delete |
| `/edit.html?id=N` | Editor with live preview and History |
| `/documents/N/print` | Print view, A4 pages. Use the browser's *Save as PDF* (the file name is pre-filled) |
| `/documents/N/standalone.html` | One self-contained HTML file (the *Download HTML* button) |
| `/snippets.html` | Snippet library, German and English side by side |
| `/settings.html` | Hourly rate, offer validity, default language |
| `/api/health` | Quick check that the server and database respond |

**Making a PDF:** open the editor, click **Print / PDF**, then in the print dialog choose *Save as PDF*.
Leave margins on *None/Default* and turn *Background graphics* **on** if the dialog offers it.

## 4. Where your data lives

Everything is inside the project folder under `.wrangler/state/v3/` (git-ignored):

| What | Where |
| --- | --- |
| Database (documents, clients, snippets, history) | `.wrangler/state/v3/d1/` |
| Photos | `.wrangler/state/v3/r2/` |

**Deleting the `.wrangler` folder deletes all documents and photos.** Make backups (next section).

Photos are stored resized (max 1600 px JPEG). Keep the originals and RAW files in Google Drive.

## 5. Backup and restore

**Back up** (database dump + photos) to a time-stamped folder outside the repository:

```bash
npm run backup
# -> ~/git/projects/snape-docs-backups/2026-10-04_175332/{database.sql, r2/}
```

To put backups somewhere else, for example a Google Drive folder:

```bash
BACKUP_DIR="$HOME/Google Drive/My Drive/Snape/Backups" npm run backup
```

Do this regularly, and before any big change (a new version of the app, deleting documents).

**Restore** from a backup (this **replaces** the current data, so make a fresh backup first if in doubt):

1. Stop the server (`Ctrl+C`).
2. Run these, replacing `<folder>` with the backup folder name:

   ```bash
   cd ~/git/projects/snape-docs
   rm -rf .wrangler/state
   npx wrangler d1 execute DB --local --file ~/git/projects/snape-docs-backups/<folder>/database.sql
   cp -R ~/git/projects/snape-docs-backups/<folder>/r2 .wrangler/state/v3/r2
   npm run dev
   ```

`database.sql` already contains the tables and the migration history, so do **not** run `npm run db:migrate` before
restoring. (Tested: this recreates all tables, documents and photos.)

## 6. Useful commands

```bash
npm run typecheck                                  # check the TypeScript for errors
npm run db:query "select number, status from documents"   # run SQL against the local database
npm run db:migrate                                 # apply new database migrations (after updating the code)
npm run backup                                     # back up database + photos
```

Importing the original hand-built offer HTML files (already done for ANG-2026-002/003/004):

```bash
node scripts/import-offers.mjs path/to/offer.html ...   # parses them into seed/
node scripts/load-seed.mjs                              # loads seed/ into the local database
```

## 7. Troubleshooting

| Problem | What to do |
| --- | --- |
| `command not found: node` | Install Node (section 1) and open a new terminal |
| `npm install` fails with a peer-dependency error | Use the versions pinned in `package.json`; do not add `--force` |
| The page does not load | Is `npm run dev` still running? Check <http://localhost:8787/api/health> |
| The live preview says *Rendering…* for a long time | The browser tab is probably in the background. Paged.js (the page layout engine) pauses in hidden tabs; bring the tab to the front |
| The preview or PDF looks different from last time | Reload the page. Pagination is calculated in the browser every time |
| A HEIC photo (iPhone) will not upload | Chrome cannot read HEIC. Export it as JPEG first (Safari can read HEIC) |
| `Save failed` shows next to the editor header | The server stopped or the document was deleted; reload the page |
| Fonts look wrong in the PDF | Make sure *Background graphics* is on and that you used the **Print / PDF** button (not the editor page itself) |
| You edited the database schema and the app crashes | Run `npm run db:migrate`; migrations are applied in order |
| Everything is gone | You probably deleted `.wrangler`. Restore from the latest backup (section 5) |
