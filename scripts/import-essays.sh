#!/bin/bash
# Import essays from an Obsidian vault (or any directory of markdown files)
# into the wiki. Copies files as-is and updates index.json.
#
# Usage: ./scripts/import-essays.sh /path/to/essays

set -e

SRC="$1"
DEST="$(cd "$(dirname "$0")/.." && pwd)/wiki/articles"

if [ -z "$SRC" ]; then
  echo "Usage: ./scripts/import-essays.sh /path/to/essays"
  echo "  Copies .md files from the source directory into wiki/articles/"
  echo "  and rebuilds index.json."
  exit 1
fi

if [ ! -d "$SRC" ]; then
  echo "Error: '$SRC' is not a directory"
  exit 1
fi

mkdir -p "$DEST"

count=0
for file in "$SRC"/*.md; do
  [ -f "$file" ] || continue
  name="$(basename "$file")"

  cp "$file" "$DEST/$name"

  count=$((count + 1))
  echo "  imported $name"
done

# Rebuild index.json from all .md files in wiki/articles/
(cd "$DEST" && ls *.md 2>/dev/null | python3 -c "
import sys, json
files = [l.strip() for l in sys.stdin if l.strip()]
print(json.dumps(sorted(files), indent=2))
" > index.json)

echo ""
echo "Done. Imported $count essays into wiki/articles/"
echo "index.json updated with $(cat "$DEST/index.json" | grep -c '\.md') entries."
