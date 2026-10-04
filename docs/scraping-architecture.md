# scraping-architecture.md

## Scope

Scraping is strictly limited to admin-triggered jobs. The scraper **only visits Goodreads genre shelf pages** — individual book detail pages are never fetched.

---

## Source URL

```
https://www.goodreads.com/shelf/show/{genre}?page={n}
```

Each page returns up to 50 books. The HTML is parsed with cheerio. Per book entry (`.leftContainer .elementList` with a `.bookTitle` link):

| Field | Source on the page | Stored as |
|---|---|---|
| Book URL | `.bookTitle` href (made absolute) | `goodreadsUrl` — upsert key |
| Title | `.bookTitle` text (includes series/format, e.g. `(Harry Potter, #1)`) | `title` — insert only |
| Author | `.authorName` text | `author` — insert only |
| Avg rating, ratings count | `<span class="greyText smallText">`: `avg rating 3.68 — 7,380,157 ratings — published 2005` | `avgRating`, `numRatings` |
| Published year | `published 2005` in the same span (negative for BCE) | `publishedYear` (v2) |
| Cover image | `a.leftAlignedImage img` src — a 50px `._SX50_` thumbnail | `coverUrl` (v2) |
| Author link | `.authorName` href (made absolute) | `authorUrl` (v2) |
| Shelf count | bare text node `(shelved 90719 times as fantasy)` | `shelvedCounts.<genre>` (v2) |

The genre itself comes from the shelf URL, not the page. Everything else on the page — position, the logged-in account's own shelf/rating widgets, form tokens — is ignored.

---

## Request Constraints

* **Rate limit**: one request per `appConfig.rateLimitMs` (seeded at 3,000 ms by `mongo-setup.md`; the code falls back to 10,000 ms only if the field is missing)
* Enforced by persisting `lastRequestAt` in the job document and checking elapsed time before each tick — so it spaces the pages *within* a job; a newly started job's first page goes out right after the previous job finishes (~0.5 s plus request time)
* Axios request timeout: 30 seconds — a hung connection acts as a natural extra delay before retry

---

## Scraping Lifecycle (per tick)

Each tick processes **one genre page**:

1. Load oldest `queued` or `running` job from `scrapeJobs`
2. Check rate limit against `lastRequestAt` — return `rate_limited` if too soon
3. Mark job `running`, stamp `lastRequestAt`
4. Fetch the shelf page with Axios (30s timeout, browser-like headers + Goodreads cookie)
5. Parse up to 50 book entries with cheerio
6. Bulk upsert books into MongoDB (`ordered: false` — partial failures don't abort the page; if **every** upsert on the page is rejected the page throws and the job is marked `failed`, rather than advancing past books that never landed)
7. Stop condition check:
   - Zero books → mark job `done`
   - Fewer than 50 books → process them, then mark job `done`
   - `currentPage` ≥ `maxPage` → mark job `done`
8. Advance `currentPage` and `pagesScraped`, mark job `running` for next tick

**Timeout handling**: if the request times out, the job reverts to `queued` (same page retried next tick) rather than failing.

---

## Book Upsert Logic

Books are keyed by `goodreadsUrl` (unique index):

* **New book**: `$setOnInsert` creates the full document; `$addToSet` adds the genre
* **Existing book**: `$addToSet` appends the genre; `$set` updates `avgRating`, `numRatings`, `updatedAt`
* **Both**: `$set` writes the shelf fields the page shows — `publishedYear`, `coverUrl`, `authorUrl`, and this genre's count at `shelvedCounts.<genre>` (dotted path; other genres' counts stay)
* If ratings can't be parsed from the page: existing values are preserved; new inserts get `avgRating: 0` as a default
* A shelf field the page doesn't show isn't written, so it never overwrites a stored value

Genres only ever accumulate — they are never removed from a book record.

---

## Resilience

| Scenario | Behaviour |
|---|---|
| Request timeout | Job reverts to `queued`, same page retried next tick |
| Partial page validation failure | Valid docs written, errors logged, job continues |
| Every upsert on a page rejected (e.g. validator not upgraded for new fields) | Job marked `failed` with `All N book writes failed on page P: …` |
| Non-timeout error | Job marked `failed`, error stored |
| Goodreads rate limiting (30s hang) | Natural buffer before retry; then requeued |
| Missing ratings on some books | Logged with count, defaults used for new inserts |

---

## Cookie Handling

The Goodreads session cookie is stored in `appConfig` and applied to every request. Refresh it via the admin UI when the session expires. Without a valid cookie, Goodreads silently returns page 1 regardless of the `?page=` parameter.

---

## Background Ticker

The ticker is started once via Next.js `instrumentation.ts` when the server process boots. It loops indefinitely:

* Jobs active → tick immediately after each successful page (500ms pause)
* Rate limited → wait out the remaining window before retrying
* No jobs → check again in 30 seconds (silent — no log spam)

On Vercel (serverless), the ticker only runs during active requests. For continuous unattended scraping, ping `POST /api/admin/tick` from an external cron service.

---

## Re-scrape Migration (shelf fields)

Scraper v2 started storing the shelf fields above. Books scraped before it don't have them, and since the scraper `$set`s them on every visit, re-scraping a genre fills them in. The admin panel's **Re-scrape for New Fields** section runs that as a one-time, re-runnable migration (`src/lib/backfill.ts`, `/api/admin/backfill`).

* **Same pipeline**: it queues ordinary `scrapeJobs` (`kind: "backfill"`, `override: true`, pages `1..target`) — the background ticker processes them like any job: same cookie, same rate limit, same upsert logic for a book found under several genres. They queue behind any jobs already waiting
* **Page depth** (`target`): as deep as the deepest pre-v2 job for the genre went; 25 for genres with no job history (the `books_raw.jl` bootstrap)
* **Which genres need it** — derived on every request, nothing extra is stored:
  * *up to date*: every book tagged with the genre already has `shelvedCounts.<genre>` — always true for genres first scraped by v2, so new genres never need it
  * *re-scraped*: a v2 job (`scraperVersion: 2`) for the genre started at page 1 and finished `done` at the target depth (or ran out of shelf first). Books still missing fields aren't on those pages any more, so re-running wouldn't reach them
  * *in queue*: a job for the genre is queued or running — it is never queued twice
  * *failed* / *needs re-scrape*: anything else (the latest v2 attempt failed, or none covered it yet) — these are what the button queues
* Re-running only queues genres still in the last group, so after failures or a stale cookie just press it again
* Every new job — manual or migration — is stamped `scraperVersion: 2`, which is how coverage survives restarts
* Requires the validator upgrade in `mongo-setup.md` §2.6; the panel blocks the migration until the live validators accept the new fields

Volume: roughly `Σ target pages` requests (shown in the panel with an estimate at the current rate limit) — e.g. 150 genres × 25 pages ≈ 3,750 pages ≈ 3.5 h at 3 s/page.
