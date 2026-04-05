# genre-filtering-logic.md

## Overview

Genre filtering follows a Steam-style tag model: genres can be in one of three states — **neutral**, **included**, or **excluded**. Active filters (both includes and excludes) float to the top of the genre list. The result set and genre counts update dynamically after every filter change.

---

## Genre States

| State | Meaning | Visual |
|---|---|---|
| Neutral | No filter applied | Unchecked, below active filters |
| Included | Book must have this genre | Checkbox checked, highlighted at top |
| Excluded | Book must NOT have this genre | Minus (−) active, highlighted at top |

Clicking the checkbox toggles a genre between neutral and included.
Clicking the minus (−) icon toggles a genre between neutral and excluded.
A genre cannot be both included and excluded simultaneously.

---

## Filter Semantics

* **Include** (AND): a book must contain **all** included genres to appear
* **Exclude** (NOT): a book containing **any** excluded genre is removed
* Exclusion takes precedence — if a genre is excluded, it removes matching books regardless of include filters

### Application Order

1. Exclusions applied first
2. Inclusions applied next (all must match)
3. Rating/count range filters applied last

---

## Genre List Behaviour

### Active Filters Section (top, highlighted)

* Shows all genres currently in included or excluded state
* Both included and excluded genres remain visible here while active — they do not disappear from the list
* Sorted: included genres first, then excluded genres

### Neutral Genres Section (below)

* Shows top N genres by descending book count under current filters
* The count shown reflects books remaining after all active filters are applied
* Genres already in the active section are not repeated here

---

## Genre Ranking Algorithm

At any moment:

1. Apply all active filters (exclusions → inclusions → rating/count filters)
2. Count genres across the remaining books
3. Sort genres by descending book count
4. Display top 15–20 genres in the neutral section

This means the neutral genre list is always contextually relevant — it surfaces what's most present in the current result set.

---

## Examples

**Initial state** (no filters):
```
Fiction (19,000)   □  −
Fantasy  (5,000)   □  −
...
```

**After including "Fiction":**
```
[Active - Included]
Fiction            ✓  −

[Neutral - top by count]
Science Fiction (4,900)  □  −
Fantasy         (4,800)  □  −
...
```

**After also excluding "Fantasy":**
```
[Active - Included]
Fiction            ✓  −

[Active - Excluded]
Fantasy            □  − (active)

[Neutral]
Science Fiction (4,900)  □  −
...
```

---

## Genre Counts

* Counts are always live — recomputed via Atlas Search facets after every filter change
* The count for a neutral genre reflects books that would be added to the result set if that genre were included (given all current filters)
* Genres with a count of 0 under the current filters are hidden from the neutral list

---

## Genre List Size

* No hard limit on the genre list for active filters
* Neutral section shows top 15–20 genres by count
* A search bar below lets the user find and activate any genre not in the visible list

---

## Invariants

* Genres only accumulate in the system — no genre is ever deleted
* The genre list reflects what is actually in the dataset, not a predefined taxonomy
* No automatic merging or normalization in the UI — what you see is what's in the `genres` collection
