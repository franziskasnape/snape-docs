#!/bin/sh
# Git pre-push guard for the PUBLIC snape-docs repository.
# Blocks a push if any commit about to be published
#   - contains a file type that could be client data or artwork (images, PDFs, fonts, databases, spreadsheets, ...), or
#   - contains one of the private terms listed in .git/sensitive-terms.txt (client names, artists, titles, ...).
# That terms file lives inside .git/, so it is never pushed. Install with: node scripts/install-git-hook.mjs
GITDIR=$(git rev-parse --git-dir)
TERMS="$GITDIR/sensitive-terms.txt"
ZERO=0000000000000000000000000000000000000000
fail=0
TMP=$(mktemp); [ -s "$TERMS" ] && grep -v '^[[:space:]]*$' "$TERMS" | grep -v '^#' > "$TMP"

while read -r local_ref local_sha remote_ref remote_sha; do
  [ "$local_sha" = "$ZERO" ] && continue                      # deleting a branch
  if [ "$remote_sha" = "$ZERO" ]; then range="$local_sha"; else range="$remote_sha..$local_sha"; fi
  for c in $(git rev-list $range); do
    short=$(echo "$c" | cut -c1-8)
    bad=$(git ls-tree -r --name-only "$c" | grep -i -E '\.(jpe?g|heic|tiff?|gif|webp|pdf|otf|ttf|woff2?|sqlite3?|db|xlsx?|docx?|numbers|pages|indd|psd|bundle)$|\.png$|\.sql$' \
          | grep -v -x -e 'public/seal.png' | grep -v -E '^migrations/[^/]+\.sql$')
    if [ -n "$bad" ]; then echo "BLOCKED: commit $short contains files that must not be published:"; echo "$bad" | sed 's/^/    /'; fail=1; fi
    if [ -s "$TMP" ]; then
      hits=$(git grep -l -i -F -f "$TMP" "$c" -- . ':!package-lock.json' 2>/dev/null | sed "s/^[0-9a-f]*://")
      if [ -n "$hits" ]; then echo "BLOCKED: commit $short mentions a private term in:"; echo "$hits" | sed 's/^/    /'; fail=1; fi
    fi
  done
done
rm -f "$TMP"
[ -s "$TERMS" ] || { echo "WARNING: $TERMS is missing or empty, so term checks were skipped."; }
[ $fail -ne 0 ] && { echo; echo "Push refused. Remove the content (and rewrite history if it is already committed), then try again."; exit 1; }
exit 0
