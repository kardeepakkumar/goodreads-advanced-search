#!/usr/bin/env bash
# Creates the Atlas Search index on the books collection.
# Run AFTER all data-import steps are complete.
# Run from repo root: bash migration/search/09-create-search-index.sh
set -euo pipefail
source "$(dirname "$0")/../load-env.sh"

export PATH="/opt/homebrew/bin:$PATH"

INDEX_FILE="$(dirname "$0")/books-search-index.json"

echo ""
echo "Creating Atlas Search index: books_search_v1"
echo "  Cluster:    $ATLAS_CLUSTER_NAME"
echo "  Project ID: $ATLAS_PROJECT_ID"
echo ""

atlas clusters search indexes create \
  --clusterName "$ATLAS_CLUSTER_NAME" \
  --projectId   "$ATLAS_PROJECT_ID" \
  --file "$INDEX_FILE"

echo ""
echo "Index creation submitted. Check status with:"
echo "  bash migration/search/10-verify-search-index.sh"
echo "Wait until status shows READY before using the app."
