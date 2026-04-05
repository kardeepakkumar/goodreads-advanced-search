#!/usr/bin/env bash
# Imports books_raw.jl into the permissive booksRaw staging collection.
# Run from repo root: bash migration/data-import/05-import-booksraw.sh
set -euo pipefail
source "$(dirname "$0")/../load-env.sh"

export PATH="/opt/homebrew/bin:$PATH"

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE_FILE="$REPO_ROOT/books_raw.jl"

if [[ ! -f "$SOURCE_FILE" ]]; then
  echo "ERROR: Source file not found: $SOURCE_FILE"
  exit 1
fi

LINE_COUNT=$(wc -l < "$SOURCE_FILE" | tr -d ' ')
echo ""
echo "Source file: $SOURCE_FILE ($LINE_COUNT lines)"
echo ""

# Create staging collection (permissive — no schema validation)
mongosh "$MONGODB_URI" --quiet --eval '
  use("goodreadsBooks");
  if (db.getCollectionNames().includes("booksRaw")) {
    print("booksRaw already exists — dropping for clean import");
    db.booksRaw.drop();
  }
  db.createCollection("booksRaw");
  print("booksRaw created");
'

echo ""
echo "Importing..."

# Strip the database from the URI for mongoimport (it needs the base URI)
BASE_URI=$(echo "$MONGODB_URI" | sed 's|/goodreadsBooks.*||')

mongoimport \
  --uri "${BASE_URI}/goodreadsBooks" \
  --collection booksRaw \
  --file "$SOURCE_FILE" \
  --type json \
  --numInsertionWorkers 4

echo ""
echo "Post-import checks:"
mongosh "$MONGODB_URI" --quiet --eval '
  use("goodreadsBooks");
  const count = db.booksRaw.estimatedDocumentCount();
  print("  booksRaw count: " + count);
  print("  Sample document:");
  printjson(db.booksRaw.findOne({}, { Link: 1, Title: 1, Author: 1, "Avg Rating": 1, "Num Ratings": 1, Genres: 1 }));
'

echo ""
echo "Duplicate URL check (expect 0):"
mongosh "$MONGODB_URI" --quiet --eval '
  use("goodreadsBooks");
  const dups = db.booksRaw.aggregate([
    { $group: { _id: "$Link", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: "duplicateUrls" }
  ]).toArray();
  if (dups.length === 0) {
    print("  OK: no duplicate URLs found");
  } else {
    print("  WARNING: " + JSON.stringify(dups));
  }
'
