# migration/

All MongoDB setup and data migration scripts. Scripts read credentials from `.env.local` (never hardcoded).

## Prerequisites

- `mongosh` installed (`brew install mongosh`)
- `atlas` CLI installed (`brew install mongodb-atlas-cli`)
- `.env.local` populated with `MONGODB_URI`, `ATLAS_PUBLIC_KEY`, `ATLAS_PRIVATE_KEY`
- `books_raw.jl` present at repo root

## Full Sequence

Run from repo root in this order:

```bash
# 1. Verify cluster is clean and discover project/cluster IDs
bash migration/setup/01-verify-cluster.sh

# → Fill in ATLAS_CLUSTER_NAME and ATLAS_PROJECT_ID in .env.local from the output above

# 2. Create collections with strict schema validation
mongosh "$MONGODB_URI" --file migration/setup/02-create-collections.js

# 3. Create regular indexes (must exist before migration — $merge on: "goodreadsUrl" requires it)
mongosh "$MONGODB_URI" --file migration/setup/03-create-indexes.js

# 4. Seed appConfig singleton
mongosh "$MONGODB_URI" --file migration/setup/04-seed-appconfig.js

# 5. Import books_raw.jl into permissive staging collection
bash migration/data-import/05-import-booksraw.sh

# 6. Transform booksRaw → books (aggregation pipeline)
mongosh "$MONGODB_URI" --file migration/data-import/06-transform-to-books.js

# 7. Populate genres collection from books
mongosh "$MONGODB_URI" --file migration/data-import/07-populate-genres.js

# 8. Verify migration results
mongosh "$MONGODB_URI" --file migration/data-import/08-verify-migration.js

# 9. Create Atlas Search index (after data is loaded, needs ATLAS_CLUSTER_NAME + ATLAS_PROJECT_ID)
bash migration/search/09-create-search-index.sh

# 10. Wait for STEADY status (2–5 min for ~46k books), then verify
bash migration/search/10-verify-search-index.sh
```

## Notes

- Steps 2–4 are safe to re-run (collections already exist = no-op)
- Steps 6–7 use `whenMatched: "keepExisting"` — re-runs only insert missing docs
- Step 5 drops and recreates `booksRaw` on each run — intentional for clean reimport
- After everything is verified, optionally drop `booksRaw`: `mongosh "$MONGODB_URI" --eval 'use("goodreadsBooks"); db.booksRaw.drop()'`
