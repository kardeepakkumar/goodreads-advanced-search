# genre-filtering-logic.md

## Overview

Genre filtering follows a Steam-style tag model: genres can be in one of three states — **neutral**, **included**, or **excluded**. Active filters (both includes and excludes) float to the top of the genre list. The result set and genre counts update after every filter change.

---

## Genre States

| State | Meaning | Visual |
|---|---|---|
| Neutral | No filter applied | Unchecked, below active filters |
| Included | Book must have this genre | Checkbox checked, blue highlight, at top |
| Excluded | Book must NOT have this genre | Minus (−) active, red strikethrough, at top |

Clicking the checkbox toggles a genre between neutral and included.
Clicking the minus (−) icon toggles a genre between neutral and excluded.
A genre cannot be both included and excluded simultaneously — activating one state clears the other.

---

## Filter Semantics

* **Include** (AND): a book must contain **all** included genres to appear
* **Exclude** (NOT): a book containing **any** excluded genre is removed
* Rating and ratings-count filters apply on top of genre filters
* All conditions combine in a single `$match` (or Atlas Search `compound`) — logical AND of every clause

### Merged genres

When genres have been merged in the admin panel (see `data-model.md` → genreAliases):

* The list shows only **canonical** names — merged-away variants disappear
* Including a merged genre matches books tagged with **any** of its raw source tags
* Excluding a merged genre removes books tagged with any of its source tags
* Counts never double-count a book that carries several source tags of the same canonical
* Filtering by a merged-away tag name (e.g. a stale bookmark) resolves to its canonical

---

## Genre List Behaviour

### Active genres (top)

* All included and excluded genres, pinned to the top **in the order they were selected** (`activeOrder`)
* They stay visible even when the panel's filter box would exclude them

### Neutral genres (below)

* The full genre list, sorted by descending book count under the current filters
* The count shown reflects books remaining after the active genre/rating filters
* Counts intentionally do **not** reflect the text search query (facets are genre/rating-scoped)
* The list is scrollable; a filter box at the top narrows it by substring match

### Selection behaviour

* Activating a genre found via the filter box clears the filter box (the full list returns, with the new active genre pinned on top)
* "Clear (n)" resets all includes and excludes at once

---

## Genre Counts

* Computed server-side per request with a regular MongoDB aggregation (`$unwind` → `$group`), never Atlas Search
* Under merges, each book's tags collapse to a canonical set (`$setUnion`) before counting — one book, one count per canonical
* Any filter change resets pagination to page 1

---

## Invariants

* Raw genres only accumulate in the system — no raw genre is ever deleted from a book
* The genre list reflects what is actually in the dataset (plus admin merges), not a predefined taxonomy
* No automatic merging or normalization — merges are explicit admin actions, applied at query/display time, and reversible via split
