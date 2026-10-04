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
npm install              # downloads the dependencies (and builds the page-layout engine, public/vivliostyle.js)
npm run fonts -- "<folder with the downloaded Synonym and Amulya fonts>"
npm run db:migrate       # creates the local SQLite database and its tables
```

The studio fonts **Synonym** and **Amulya** are free from <https://www.fontshare.com> but their licence does not allow
publishing them, so they are not in the repository. Download both, then point `npm run fonts` at the folder where they
ended up (it searches the folder recursively, for example `~/Desktop/Website`). Without them the app works but
documents are drawn in a plain sans-serif.

Optional, with the app running (see below):

```bash
npm run seed:snippets    # loads the starter library: generic treatment rows, German and English
```

The English wording in the starter library is a draft and is marked **needs review** on the Snippets page. If you keep
your own full library in `seed/snippets-seed.private.json` (git-ignored), that file is used instead of the generic one.

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

A backup is two things: a compressed copy of the database, and the photos. The photos never change once stored, so
they are kept **once** in a shared `photos/` folder and every snapshot just points at them. Backups therefore stay
small even if you take many.

```
<backup folder>/
  photos/                         every photo ever stored (grows slowly, never deleted)
  snapshots/2026-10-04_175332/    database.sql.gz, r2-index/ (which photo is which), manifest.json
```

**Where to keep them:** not only on this Mac. A copy on the same disk does not survive a lost or broken computer.
Use a folder inside **Google Drive for desktop**, which uploads it automatically. Set it once:

```bash
node scripts/autobackup.mjs set-dest "$HOME/Library/CloudStorage/GoogleDrive-<account>/My Drive/Snape Art Conservation/Backups/snape-docs"
```

(or just run a one-off `npm run backup -- --dest "<folder>"`; with neither, the default is
`~/git/projects/snape-docs-backups`, which is on this disk only.) The chosen folder is remembered in the git-ignored
file `.backup-dir`. Also turn on **Time Machine** with an external drive if you can: it is a second, independent copy.

### Back up by hand

```bash
npm run backup                     # snapshot now; does nothing if nothing changed since the last one
npm run backup -- --force          # snapshot even if nothing changed
npm run backup -- --dest "<folder>"
```

### Back up automatically (macOS)

```bash
node scripts/autobackup.mjs install      # switch on: backs up now, then every hour while you are logged in
node scripts/autobackup.mjs status       # is it on? when was the last snapshot?
node scripts/autobackup.mjs uninstall    # switch off (existing backups stay)
```

(`npm run backup:auto -- status` does the same as the second line.) Every run is skipped when nothing changed, so an
hourly schedule costs almost nothing. If the Mac was asleep, the missed run happens when it wakes up. The log is
`~/Library/Logs/snape-docs-backup.log`. The first time, macOS may ask whether `node` may access your Google Drive
folder: allow it, otherwise the scheduled job cannot write there.

**How long snapshots are kept:** all of them for 14 days, then one per day up to 90 days, then one per month.
The newest is never removed. Photos are never removed from the mirror.

### Restore

1. Stop the server (`Ctrl+C`).
2. Run (replace `latest` with a snapshot name such as `2026-10-04_175332` if you want an older one):

   ```bash
   cd ~/git/projects/snape-docs
   npm run restore -- latest
   npm run dev
   ```

Your current data is **not** deleted: it is moved to `.wrangler/state.before-restore-<time>`, so a restore can be undone
by moving that folder back. Add `--dest "<folder>"` if the backups are not in the remembered folder.
(Tested: a restore recreates all documents, clients, snippets, history and every photo, byte for byte.)

Older backups made by the previous version of this tool (folders directly under `snape-docs-backups/` containing
`database.sql` and `r2/`) are not read by `npm run restore`; they can be restored by hand with
`npx wrangler d1 execute DB --local --file <folder>/database.sql` and copying `<folder>/r2` to `.wrangler/state/v3/r2`.

## 6. Useful commands

```bash
npm run typecheck                                  # check the TypeScript for errors
npm run db:query "select number, status from documents"   # run SQL against the local database
npm run db:migrate                                 # apply new database migrations (after updating the code)
npm run backup                                     # snapshot of database + photos (see section 5)
```

Importing existing hand-built offer HTML files (one-off; they contain client data, so keep them out of the repository):

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
| The live preview says *Rendering…* for a long time | The browser tab is probably in the background. Vivliostyle (the page layout engine) pauses in hidden tabs; bring the tab to the front |
| The preview or PDF looks different from last time | Reload the page. Pagination is calculated in the browser every time |
| A HEIC photo (iPhone) will not upload | Chrome cannot read HEIC. Export it as JPEG first (Safari can read HEIC) |
| `Save failed` shows next to the editor header | The server stopped or the document was deleted; reload the page |
| Fonts look wrong in the PDF | Make sure *Background graphics* is on and that you used the **Print / PDF** button (not the editor page itself) |
| You edited the database schema and the app crashes | Run `npm run db:migrate`; migrations are applied in order |
| Everything is gone | You probably deleted `.wrangler`. Run `npm run restore -- latest` (section 5) |
