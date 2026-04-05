#!/usr/bin/env bash
# Verify Atlas cluster state and list existing databases/collections.
# Run from repo root: bash migration/setup/01-verify-cluster.sh
set -euo pipefail
source "$(dirname "$0")/../load-env.sh"

export PATH="/opt/homebrew/bin:$PATH"

echo ""
echo "=== 1. Atlas projects ==="
atlas projects list --output json

echo ""
echo "=== 2. Atlas clusters ==="
atlas clusters list --projectId "$ATLAS_PROJECT_ID" --output json

echo ""
echo "=== 3. Existing databases on cluster ==="
mongosh "$MONGODB_URI" --quiet --eval "
  const dbs = db.adminCommand({ listDatabases: 1 });
  print(JSON.stringify(dbs.databases.map(d => ({ name: d.name, sizeOnDisk: d.sizeOnDisk })), null, 2));
"

echo ""
echo "=== 4. Collections in goodreadsBooks (if it exists) ==="
mongosh "$MONGODB_URI" --quiet --eval "
  const cols = db.getCollectionNames();
  if (cols.length === 0) {
    print('(no collections yet — clean slate)');
  } else {
    print(JSON.stringify(cols, null, 2));
  }
"

echo ""
echo "=== 5. Existing Atlas Search indexes on books collection (if any) ==="
mongosh "$MONGODB_URI" --quiet --eval "
  try {
    const indexes = db.books.aggregate([{ \$listSearchIndexes: {} }]).toArray();
    if (indexes.length === 0) {
      print('(none)');
    } else {
      print(JSON.stringify(indexes.map(i => ({ name: i.name, status: i.status })), null, 2));
    }
  } catch(e) {
    print('(books collection does not exist yet — expected on fresh cluster)');
  }
"
