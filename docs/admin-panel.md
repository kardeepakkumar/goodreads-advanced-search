# admin-panel.md

## Access

* Route: `/admin`
* Username + password authentication (credentials set via env vars)
* Session managed with iron-session (encrypted cookie)

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

---

## Section 3: Scraper Log

* Shows the last 20 lines of scraper activity
* Polled from the server every 3 seconds
* Logs are in-memory — they reset on server restart
* Shows: page progress, book counts, missing-rating warnings, errors

---

## Section 4: Recent Jobs

* Shows the last 20 jobs, sorted by creation time
* Auto-refreshes every 4 seconds when a job is active, every 20 seconds when idle
* Columns: genre, status, current page, pages scraped, max page, created, error

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
