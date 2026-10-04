# admin-panel.md

## Access

* Route: `/admin`
* Username + password authentication (credentials set via env vars)
* Session managed with iron-session (encrypted cookie)
* Responsive: sections stack and forms go full-width on phones; the jobs table scrolls horizontally

---

## Section 1: Config

### Goodreads Cookie

* Paste the raw Goodreads session cookie string
* Saved to the `appConfig` collection (`goodreadsCookie` field)
* Takes effect immediately for all subsequent scraping
* Refresh it when the session expires — expiry is silent (Goodreads returns page 1 regardless of `?page=`)
* Not an environment variable; stored in the database and managed here

### Rate Limit

* Stored in `appConfig.rateLimitMs` (default: 10,000ms)
* Not editable via the admin UI — change directly in MongoDB if needed
* Enforced by persisting `lastRequestAt` on the job document and checking it before each tick

---

## Section 2: Queue Job

Add a genre to the scraping queue.

| Field | Required | Default | Notes |
|---|---|---|---|
| Genre slug | Yes | — | Goodreads shelf slug, e.g. `fantasy`, `science-fiction` |
| Start page | No | 1 | Resume a partial scrape from a specific page |
| Max page | No | 25 | Stop after this many pages (50 books/page = up to 1,250 books) |

New jobs are stamped `scraperVersion: 2`, `kind: "manual"`.

---

## Section 3: Re-scrape for New Fields

One-time (and safely re-runnable) migration that fills the shelf fields — published year, cover image, author link, per-genre shelved count — into books scraped before the scraper captured them. Mechanics in `scraping-architecture.md` → Re-scrape Migration.

### Books

* How many books have **all 4 fields**, and how many are **missing at least one**
* Per field: books with it / without it
* Some books stay incomplete after a re-scrape: Goodreads shows no year for a few, and books that have dropped off a genre's scraped pages aren't revisited

### Genres

* Counts per status — *up to date*, *re-scraped*, *in queue*, *failed*, *needs re-scrape*
* The plan: how many genres and pages a re-scrape would fetch, with a time estimate at the current rate limit
* **Queue re-scrape for N genres** — queues one job per *failed* / *needs re-scrape* genre (`kind: "backfill"`, pages 1 to the genre's previous depth, 25 if it has no job history). Genres already covered, already queued, or first scraped after the change are skipped, so pressing it again only retries what still needs it
* **Per-genre status** (expandable) — genre, status, books tagged with it, books with its shelved count, pages to scrape; what still needs doing is listed first

### Safety

* Jobs go through the normal queue: same cookie, same rate limit, same background ticker
* If the MongoDB validators haven't been upgraded for the new fields (`mongo-setup.md` §2.6), the section shows a warning and the queue button stays disabled (the API answers 409)
* The overview aggregates every book, so it loads when the page opens and on **Refresh** — it isn't polled

---

## Section 4: Genre Merges

Manual, deliberate genre normalization. Merges apply at query/display time only — raw tags on books are never rewritten, so every merge is fully reversible.

### Merge form

* **Merge genre** → **Into**: e.g. merge `science-fiction` into `sci-fi`
* Both fields offer suggestions (datalists) from existing genres; free text is allowed — the target may be brand new and becomes a merged genre simply by being pointed at
* Merging a genre that is itself a merge target moves its whole group to the new target
* Merging **into** an already-merged-away genre is rejected (409) with a hint naming the real canonical — mappings stay flat, no chains

### Merged genres list

* One row per canonical: name, deduplicated book count, and the source tags merged into it (`sci-fi · 7 books ← science-fiction, scifi`)
* A book tagged with several source tags of the same canonical counts **once**
* **Split** deletes the group's alias mappings — every source tag returns to being an original genre, exactly as before the merge

### Original genres list

* Every raw tag (registered or found on books) with its book count
* Merged-away tags show struck through with a `→ canonical` marker
* A filter box narrows the list; clicking a row prefills the merge form

Effect on the public page: the genre sidebar, facet counts, and book genre chips all show canonical names; filtering by a merged genre matches any of its source tags. See `genre-filtering-logic.md`.

---

## Section 5: Scraper Log

* Shows the last 20 lines of scraper activity
* Polled from the server every 3 seconds
* Logs are in-memory — they reset on server restart
* Shows: page progress, book counts, missing-rating warnings, errors

---

## Section 6: Recent Jobs

* Shows the last 20 jobs, sorted by creation time
* Auto-refreshes every 4 seconds when a job is active, every 20 seconds when idle
* Columns: genre, status, current page, pages scraped, max page, created, error
* Jobs queued by the re-scrape migration carry a small `re-scrape` label next to the genre

### Job statuses

| Status | Meaning |
|---|---|
| `queued` | Waiting to be picked up by the background ticker |
| `running` | Currently being scraped (or recovering from a timeout) |
| `done` | All pages scraped successfully |
| `failed` | Hit a non-recoverable error — check the error column |

---

## Background Scraper

The scraper runs automatically in the background via the Next.js instrumentation hook — no manual controls needed. It picks up the next queued job, respects the rate limit, and advances page by page until the job is done or fails.

Timeouts from Goodreads requeue the page rather than fail the job — the next tick retries the same page after the rate limit delay.
