# tech-stack.md

## Principles

* Use popular, well-supported tools
* Keep operations simple (single deployment target)
* Separate concerns logically even if deployed together
* Prefer managed services (MongoDB Atlas, Vercel)

---

## Hosting & Runtime

* **Hosting**: Vercel
* **Secrets / Configuration**: Vercel Environment Variables (production) / `.env.local` (local)
* **Persistent Storage**: MongoDB Atlas M0 (free tier)

---

## Web Application

* **Framework**: Next.js 15 (App Router)
* **Language**: TypeScript
* **Styling**: Tailwind CSS (dark-only theme via CSS custom properties)

---

## Authentication (Admin Only)

* **Library**: iron-session v8 (encrypted cookie sessions)
* Admin route protection for `/admin` and all `/api/admin/*` endpoints
* Single-admin setup — username + bcrypt password hash stored in environment variables
* Password hash is base64-encoded in env to avoid shell variable expansion issues

---

## Search

* **Primary approach**: MongoDB Atlas Search
* Full-text search over title and author (lucene.standard analyzer, fuzzy matching)
* Wildcard prefix matching to catch substrings (e.g. "murder" → "murderbot")
* Genre facets via Atlas Search `$facet` stage
* Falls back to plain MongoDB aggregation when no text query is present

---

## Scraping

### Architecture

* Scraping state lives in the `scrapeJobs` MongoDB collection
* Each tick processes one genre shelf page: fetch → parse → bulk upsert
* Background ticker runs as a persistent loop started via Next.js `instrumentation.ts` on server boot
* Rate limit (default 10 seconds) is stored in `appConfig` and enforced via `lastRequestAt` on the job document

### Rate Limiting & Resilience

* **Default rate limit**: 1 request per 10 seconds (configurable in `appConfig` via MongoDB)
* Timeouts revert the job to `queued` status — same page is retried on next tick
* `bulkWrite` uses `ordered: false` — individual document failures don't abort the rest of the page
* Books with unparseable ratings get default values (`avgRating: 0`) on first insert; existing books are unaffected

### Failure Handling

* Non-timeout errors mark the job `failed`
* Timeout errors (Goodreads rate-limiting hang) requeue for retry
* Job status and progress are visible in the admin panel in real time

---

## Configuration & Secrets

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `ADMIN_USERNAME` | Admin login username |
| `ADMIN_PASSWORD_HASH_B64` | Base64-encoded bcrypt hash of admin password |
| `IRON_SESSION_SECRET` | At least 32-character random string for session encryption |

The Goodreads session cookie and scraper rate limit are stored in the `appConfig` MongoDB collection and set via the admin UI — they are not environment variables.

### Local Development

Copy `.env.example` → `.env.local`. Next.js loads `.env.local` automatically. Never commit `.env.local`.

### Vercel Production

Set the same variables in the Vercel project dashboard under **Environment Variables**.

> See `docs/vercel-setup.md` for full deployment walkthrough.
