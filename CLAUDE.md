# CLAUDE.md — Project context for Claude Code

## What this is

A genre-first book discovery app built on Goodreads shelf data. Users filter books by genre combinations, rating, and text search. Data is scraped from Goodreads and stored in MongoDB Atlas. There is no public-facing write surface — all scraping is admin-only.

## Tech stack

- **Next.js 15** App Router, TypeScript, Tailwind CSS (dark-only)
- **MongoDB Atlas** M0 free tier — strict JSON Schema validators on all collections
- **iron-session v8** for admin auth (encrypted cookie)
- **Atlas Search** for full-text + wildcard search and genre facets
- **cheerio + axios** for scraping Goodreads shelf pages

## Key architectural decisions

**Two-path API in `/api/books`**: no text query → plain MongoDB aggregation; text query present → Atlas Search pipeline. Do not merge these paths.

**Background scraper via `instrumentation.ts`**: the ticker loop starts on server boot, runs independently of the browser. On Vercel serverless this dies between invocations — documented limitation. Do not add client-side tick loops back.

**In-memory log buffer on `global`**: `autoTicker.ts` stores logs in `global.__scraperLogs` so the array is shared across Next.js module instances. The API route imports the same reference. This is intentional — do not move it to module-level state.

**Genre insertion order in UI**: `activeOrder` state in `GenrePanel.tsx` preserves the order genres were selected. Active genres are always shown at the top of the panel even when the search filter is active.

**Genre merges are view-time only**: `genreAliases` docs (`_id` = source tag, `canonical` = target) are applied in `src/lib/aliases.ts` when building queries, facets, and result projections (`/api/books`, `/api/genres`, admin overview). Raw `genres` arrays on books are never rewritten — a merge is fully undone by deleting its alias docs (Split in the admin panel). Mappings stay flat: merging into an already-merged genre is rejected with 409. Facet/result genres dedupe per book via `$setUnion`, so a book tagged with several sources of one canonical counts once. With zero aliases every pipeline is byte-identical to the pre-alias shape — tests rely on this.

## MongoDB — critical gotchas

All collections have `additionalProperties: false` strict validators. Any write must include **all required fields** with **correct BSON types** or it will fail with "Document failed validation".

| Field type | Wrong | Right |
|---|---|---|
| Dates | `new Date().toISOString()` | `new Date()` |
| Integers | `someNumber` (JS double) | `new Int32(someNumber)` |
| ObjectIds | hex string | `new ObjectId()` |

The `books` collection requires: `goodreadsUrl`, `title`, `author`, `avgRating`, `numRatings`, `genres`, `genresAutocomplete`, `firstSeenGenre`, `schemaVersion`, `createdAt`, `updatedAt`.

`$setOnInsert` and `$addToSet` cannot both target the same field in one operation — MongoDB throws a path conflict error. `genres` and `genresAutocomplete` are handled by `$addToSet` only; `$setOnInsert` does not touch them.

## Env var gotcha

`ADMIN_PASSWORD_HASH_B64` stores the bcrypt hash **base64-encoded**. Reason: dotenv-expand treats `$2a`, `$10`, etc. in bcrypt hashes as shell variable references and mangles the value. The login route decodes it before comparing:
```ts
const validHash = Buffer.from(process.env.ADMIN_PASSWORD_HASH_B64!, 'base64').toString('utf8')
```
Do not change this back to a raw hash in the env.

## Goodreads scraping

- Shelf page HTML format: ratings are in `<span class="greyText smallText">` with text `avg rating 3.68 — 7,380,157 ratings — published 2005`
- The old `.minirating` class no longer exists on Goodreads pages
- `ordered: false` on `bulkWrite` is intentional — partial page failures should not abort the whole page
- Timeouts revert job to `queued` (retry same page), not `failed`
- Rate limit default: 10 seconds, stored in `appConfig.rateLimitMs` in MongoDB (not an env var)

## Testing

- `npm test` (Vitest run) / `npm run test:watch`; CI runs the suite on every push to `main` (`.github/workflows/tests.yml`)
- Tests pin **behavior contracts** — API URLs/payloads, session token flow, polling cadence (jobs 4s/20s, logs 3s, search debounce 400ms), include/exclude semantics, scraper BSON write shapes — via accessible queries (placeholders, titles, roles, labels). UI restyling must keep them green **without edits**
- Component tests live in `tests/components` (jsdom via docblock), lib/API tests in `tests/unit` and `tests/api` (node). `tests/helpers/` has the mocked Mongo driver surface, a real iron-session login helper, and Goodreads shelf HTML fixtures
- With zero `genreAliases` docs the query builders emit pipelines **byte-identical** to the pre-merge shapes; the legacy-shape tests depend on this — keep the identity-when-empty property when touching `lib/search.ts` or `/api/books`

## File structure

```
src/
  app/
    page.tsx                  # Public discovery page
    admin/page.tsx            # Admin dashboard (auth required)
    api/
      books/                  # Main search endpoint
      genres/                 # Genre list for the sidebar (merge-aware)
      admin/
        config/               # Cookie + rate limit config
        jobs/                 # Scrape job queue
        aliases/              # Genre merges: overview / merge / split
        tick/                 # Single tick (used by background loop)
        logs/                 # In-memory scraper log buffer
        auth/login|logout/    # Admin session management
  components/
    DiscoveryPage.tsx         # Top-level discovery UI orchestrator (+ mobile drawer/disclosure state)
    GenrePanel.tsx            # Steam-style genre filter sidebar
    BookTable.tsx             # Results: table on md+, cards below (CSS-only)
    SearchBar, RatingFilters, Pagination
  lib/
    mongodb.ts                # Singleton connection
    scraper.ts                # cheerio HTML parsing + bulkWrite
    ticker.ts                 # Core tick logic (shared)
    autoTicker.ts             # Background loop + log buffer
    search.ts                 # Query builders (alias-aware, identity when no aliases)
    aliases.ts                # Genre merge map + resolution helpers + pipeline exprs
    auth.ts                   # iron-session config
  instrumentation.ts          # Starts background ticker on server boot
  types/index.ts              # All shared TypeScript types
tests/                        # Vitest suite (unit / api / components / helpers)
vitest.config.ts
.github/workflows/tests.yml   # CI: full suite on push to main
```

## Docs

Full architecture docs are in `docs/`. Key files:
- `docs/tech-stack.md` — decisions and rationale, testing & CI
- `docs/product-spec.md` — vision, goals, invariants
- `docs/data-model.md` — collection shapes and field rules (incl. genreAliases)
- `docs/mongo-setup.md` — source of truth for recreating the DB: validators, indexes, Atlas Search index
- `docs/scraping-architecture.md` — scraper lifecycle, resilience
- `docs/admin-panel.md` — what each admin section does (incl. Genre Merges)
- `docs/main-page-ui.md` — discovery page layout across desktop/tablet/phone
- `docs/genre-filtering-logic.md` — tag filtering semantics, merged-genre behavior
- `docs/vercel-setup.md` — deployment walkthrough
