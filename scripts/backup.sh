#!/usr/bin/env bash
# Back up the LOCAL database and images to a timestamped folder outside the repo.
# Usage: npm run backup            (default target: ~/git/projects/snape-docs-backups)
#        BACKUP_DIR=~/Google\ Drive/... npm run backup
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="${BACKUP_DIR:-$HOME/git/projects/snape-docs-backups}/$(date +%Y-%m-%d_%H%M%S)"
mkdir -p "$DEST"
npx wrangler d1 export DB --local --output "$DEST/database.sql" >/dev/null
cp -R .wrangler/state/v3/r2 "$DEST/r2"
echo "Backup written to $DEST"
echo "  database.sql  ($(wc -c < "$DEST/database.sql" | tr -d ' ') bytes)"
echo "  r2/           ($(du -sh "$DEST/r2" | cut -f1) of images)"
echo "Restore: wrangler d1 execute DB --local --file database.sql  (on a fresh db), and copy r2/ back into .wrangler/state/v3/r2"
