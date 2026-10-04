# Publishing: this repository is public

The code lives on GitHub in a **public** repository. Everything pushed there can be read by anyone, forever (clones,
forks and caches outlive a deleted repository). So the rule is simple: **the repository contains code only**.

## What must never be committed

| Never | Why | How it is enforced |
| --- | --- | --- |
| Client names, addresses, contacts, e-mails | Confidential | `seed/` and `.wrangler/` are git-ignored; the pre-push guard checks for private terms |
| Anything about pieces: artists, titles, techniques, conditions, offer texts | Confidential | Same; the starter snippet library in the repo is generic on purpose |
| Photos or images of artworks (any image except the studio seal) | Confidential / copyright | `.gitignore` ignores all image types except `public/seal.png`; the guard blocks them |
| Exports, databases, backups, PDFs, spreadsheets | Contain all of the above | Ignored; the guard blocks them |
| Fonts (Synonym, Amulya) | The Fontshare licence forbids publishing them | `public/fonts/*.otf` is ignored; install with `npm run fonts -- <folder>` |
| Keys, tokens, passwords, `.dev.vars`, `.env` | Secrets | Ignored. Cloudflare logins are stored by Wrangler outside the repo |
| Your Google Drive path (`.backup-dir`) | Contains your account name | Ignored |

What is intentionally public: the source code, the schema migrations, the generic starter snippets, the studio seal
(`public/seal.png`) and the studio's business contact details in `src/core/i18n.ts` (the same as on its website).

## Where the real data lives instead

- Documents, clients, photos: `.wrangler/` on your computer, and the backups in Google Drive (see [RUNNING.md](RUNNING.md)).
- Your full snippet library (wording from real jobs): `seed/snippets-seed.private.json`. `npm run seed:snippets` uses it
  when it exists, otherwise the generic starter set from the repository.
- Fonts: `public/fonts/` on your computer.

## Setting up on a new computer

```bash
git clone https://github.com/<your-account>/snape-docs.git
cd snape-docs
npm install                                    # also copies the Paged.js page-layout script into public/
npm run fonts -- "/folder/with/the/downloaded/Synonym/and/Amulya/fonts"
node scripts/install-git-hook.mjs              # installs the publish guard (see below)
npm run db:migrate && npm run dev
```

Without the fonts the app still works but documents are drawn in a plain sans-serif. Download Synonym and Amulya
(free) from <https://www.fontshare.com>.

## The publish guard (pre-push hook)

`scripts/pre-push-guard.sh` runs automatically before every `git push` once installed
(`node scripts/install-git-hook.mjs`). It inspects **every commit about to be published, including old ones**, and
refuses the push if a commit contains

1. a file type that could be client data or artwork (images other than the seal, PDFs, fonts, databases, spreadsheets,
   SQL other than `migrations/`), or
2. any private term listed in **`.git/sensitive-terms.txt`** (client names, artist names, piece titles, street names…).
   That file sits inside `.git/`, so it is never pushed. Add new clients and artists to it as you take on work.

The same rules are also checked by `npm test` (`tests/unit/repo-hygiene.test.js`, `tests/unit/guard.test.js`), so a bad `.gitignore` change or a leaked name shows up as a failing test.

It is a safety net, not a guarantee: it cannot recognise a client's name it has not been told about. Before pushing
anything new, glance at `git diff --stat origin/main` and the new files.

## If something sensitive was pushed by mistake

Deleting it in a later commit is **not** enough, because the old commit stays reachable.

1. Make the repository **private** right away (GitHub → Settings → Danger zone → Change visibility). This stops new
   readers but does not erase what was already copied.
2. Remove the content from the whole history (for example with `git filter-repo`, or `git filter-branch`), then force-push.
   Ask GitHub support to purge cached views and any forks if the data was serious.
3. Tell the affected client if their data was exposed; if it contained keys or passwords, **rotate them** (they are
   compromised even after removal).

## Before making a change public: checklist

- [ ] `git status` shows no unexpected new files
- [ ] `git diff --stat` looks like code and docs only
- [ ] No real names, addresses or piece details in code, comments, docs, tests, commit messages or screenshots
- [ ] The guard is installed and `.git/sensitive-terms.txt` is up to date
