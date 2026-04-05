# shelf-scraping-findings.md

**Date:** 2026-04-04
**URL studied:** `https://www.goodreads.com/shelf/show/fiction?page=N`
**Method:** Single HTTP GET per page, no JavaScript rendering required

---

## 1. Pagination — The Cookie Problem

### Without authentication

The `?page=` parameter is silently ignored. Every page returns the same 50 books. No error, no redirect — a silent failure that is easy to miss.

### With authentication

Pagination works correctly. Page 1 and page 2 return completely different, non-overlapping sets of 50 books.

**What triggers authentication:** A valid Goodreads session cookie in the `Cookie` request header.

### Cookie format

A single line of semicolon-separated `key=value` pairs. Example keys:

```
session-id=...  ubid-main=...  x-main=...  at-main=...
sess-at-main=...  session-token=...  _session_id2=...
locale=en  likely_has_account=true
```

**Cookie expiry detection:** Compare book URLs on page 1 vs page 2. More than a handful of overlapping URLs means the cookie has expired and pagination is broken.

**Important:** Do not commit `cookie.txt` to version control — it contains live session tokens.

---

## 2. Page Structure

* HTML is fully server-rendered — `axios` + `cheerio` is sufficient, no headless browser needed
* Each book entry is wrapped in a `.elementList` div
* A page returns **50 book entries** plus 2 wrapper/UI elements that also match `.elementList` — filter by checking for a `.bookTitle` child

---

## 3. Fields Available on the Shelf Page

All fields come from a single GET per page. No book detail page visit is needed or used.

| Field | Selector / Source | Notes |
|---|---|---|
| `goodreadsUrl` | `.bookTitle` href | Normalize: prepend `https://www.goodreads.com` if relative |
| `title` | `.bookTitle` text | May include edition e.g. `"1984 (Paperback)"` |
| `author` | `.authorName` text | Full name |
| `avgRating` | `.smallText` text | Regex: `avg rating\s+([\d.]+)` → parseFloat |
| `numRatings` | `.smallText` text | Regex: `—\s*([\d,]+)\s+rating` → strip commas → parseInt |
| `coverImageUrl` | `img[src]` | Thumbnail URL; strip size suffix for full-res (see below) |

**Field coverage:** 96–100% across all 50 books per page.

### Genre assignment

Genres are **not in the page HTML**. The genre comes from the shelf URL context:

> A book found at `.../shelf/show/science-fiction?page=N` gets `"science-fiction"` added to its `genres` list.

### Cover image — full resolution

Thumbnail URLs contain a size suffix like `._SX50_.jpg`. Strip it for the full-resolution image:

```
thumbnail: https://images.gr-assets.com/books/1234._SX50_.jpg
full-res:  https://images.gr-assets.com/books/1234.jpg
```

Regex to strip: `/\._[A-Z]{2}\d+_/g` → `''`

---

## 4. Fields Not Available from the Shelf Page

These require visiting individual book detail pages — which this application **never does**:

* Genre tags (handled by shelf context instead)
* Description / synopsis
* Page count, ISBN, series, publisher, exact publish date
* Review text, awards

---

## 5. Implementation Notes (TypeScript)

### Libraries

* `axios` — HTTP requests
* `cheerio` — HTML parsing (jQuery-like API for Node)

### Whitespace normalization

```typescript
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
```

### URL normalization

```typescript
const href = titleEl.attr('href') ?? '';
const goodreadsUrl = href.startsWith('http') ? href : `https://www.goodreads.com${href}`;
```

### Parsing `avgRating` and `numRatings` from `.smallText`

```typescript
const smallText = clean($(el).find('.smallText').text());

const ratingMatch = smallText.match(/avg rating\s+([\d.]+)/);
const avgRating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

const countMatch = smallText.match(/—\s*([\d,]+)\s+rating/);
const numRatings = countMatch ? parseInt(countMatch[1].replace(/,/g, ''), 10) : null;
```

### Cookie loading from file

```typescript
import * as fs from 'fs';

function loadCookie(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8').trim().replace(/^1\t/, '');
}
```

Pass as: `headers: { Cookie: cookieString }`

### Rate limiting

Minimum **3 seconds between requests** (enforced by `rateLimitMs` in `appConfig`):

```typescript
await new Promise(resolve => setTimeout(resolve, 3000));
```

---

## 6. Scraping Strategy

```
for page = 1..N:
  GET https://www.goodreads.com/shelf/show/{genre}?page={page}
  parse up to 50 books
  for each book:
    if exists in DB → $addToSet genre
    if new → insert with genre as firstSeenGenre

  stop if: 0 books | <50 books | duplicate page | page > 100
  wait 3s before next request
```

---

## 7. Limitations and Risks

* **Cookie expiry:** Silent — pagination breaks without error. Detect via page overlap check.
* **No official API:** Goodreads shut down its API in 2020. HTML structure can change without notice.
* **ToS:** Restricts automated scraping. Use with enforced delays, personal/research use only.
* **IP blocking:** Scraping without delays will result in blocks.
* **Shelf size unknown:** No total count in the HTML — paginate until a stop condition is hit.
