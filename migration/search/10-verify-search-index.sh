#!/usr/bin/env bash
# Checks the status of the Atlas Search index.
# Run from repo root: bash migration/search/10-verify-search-index.sh
set -euo pipefail
source "$(dirname "$0")/../load-env.sh"

export PATH="/opt/homebrew/bin:$PATH"

echo ""
echo "Atlas Search indexes on books collection:"
atlas clusters search indexes list \
  --clusterName  "$ATLAS_CLUSTER_NAME" \
  --projectId    "$ATLAS_PROJECT_ID" \
  --db           goodreadsBooks \
  --collection   books

echo ""
echo "Live status via mongosh (\$listSearchIndexes):"
mongosh "$MONGODB_URI" --quiet --eval '
  use("goodreadsBooks");
  try {
    const indexes = db.books.aggregate([{ $listSearchIndexes: {} }]).toArray();
    if (indexes.length === 0) {
      print("  (no search indexes found)");
    } else {
      indexes.forEach(i => print("  " + i.name + " | " + i.status));
    }
  } catch(e) {
    print("  Error: " + e.message);
  }
'
