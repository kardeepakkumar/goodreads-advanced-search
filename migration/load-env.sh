#!/usr/bin/env bash
# Source this file before running any migration script:
#   source migration/load-env.sh
# It loads .env.local into the current shell environment.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env.local not found at $ENV_FILE"
  exit 1
fi

# Strip comments and blank lines, then export
while IFS= read -r line; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue
  export "$line" 2>/dev/null || true
done < "$ENV_FILE"

# Atlas CLI expects these specific env var names
export MONGODB_ATLAS_PUBLIC_API_KEY="$ATLAS_PUBLIC_KEY"
export MONGODB_ATLAS_PRIVATE_API_KEY="$ATLAS_PRIVATE_KEY"

echo "Loaded: $ENV_FILE"
echo "  MONGODB_URI        = ${MONGODB_URI:0:55}..."
echo "  ATLAS_CLUSTER_NAME = ${ATLAS_CLUSTER_NAME:-<not set>}"
echo "  ATLAS_PROJECT_ID   = ${ATLAS_PROJECT_ID:-<not set>}"
