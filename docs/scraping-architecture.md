# scraping-architecture.md

## Scope

Scraping is strictly limited to admin-triggered jobs. The scraper **only visits Goodreads genre shelf pages** — individual book detail pages are never fetched.

---

## Source URL

```
https://www.goodreads.com/shelf/show/{genre}?page={n}
```

Each page returns up to 50 books. The HTML is parsed with cheerio — ratings are in a `<span class="greyText smallText">` element with the format `avg rating 3.68 — 7,380,157 ratings — published 2005`.

---

## Request Constraints

* **Rate limit**: at most 1 request per 10 seconds (stored in `appConfig.rateLimitMs`, default 10,000)
* Enforced by persisting `lastRequestAt` in the job document and checking elapsed time before each tick
* Axios request timeout: 30 seconds — a hung connection acts as a natural extra delay before retry

---

## Scraping Lifecycle (per tick)

Each tick processes **one genre page**:

1. Load oldest `queued` or `running` job from `scrapeJobs`
2. Check rate limit against `lastRequestAt` — return `rate_limited` if too soon
3. Mark job `running`, stamp `lastRequestAt`
4. Fetch the shelf page with Axios (30s timeout, browser-like headers + Goodreads cookie)
5. Parse up to 50 book entries with cheerio
6. Bulk upsert books into MongoDB (`ordered: false` — partial failures don't abort the page)
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
* If ratings can't be parsed from the page: existing values are preserved; new inserts get `avgRating: 0` as a default

Genres only ever accumulate — they are never removed from a book record.

---

## Resilience

| Scenario | Behaviour |
|---|---|
| Request timeout | Job reverts to `queued`, same page retried next tick |
| Partial page validation failure | Valid docs written, errors logged, job continues |
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
