# main-page-ui.md

The public discovery page (`/`). One layout, responsive at three sizes: desktop (`lg+`), tablet (`md`–`lg`), and phone (below `md`). Dark theme only.

---

## Desktop layout (`lg` and up)

* **Left sidebar (fixed column)**: genre tag panel
* **Toolbar (top of main area)**: search bar, with rating/sort controls in a row beneath it
* **Stats bar**: matching count · total books shelved
* **Results table**: title, author, rating, # ratings, genre chips
* **Footer**: pagination

## Tablet (`md`–`lg`)

Same as desktop except the genre panel becomes a **slide-over drawer**, opened via a "Genres" button in the toolbar. The button shows a badge with the active include/exclude count.

## Phone (below `md`)

* Genre panel: slide-over drawer (as tablet)
* Rating/sort controls: collapsed behind a **"Filters"** toolbar button (a dot marks non-default filters); the same controls, just disclosed
* Results: each row renders as a **card** — title, author, stars + rating + ratings count, genre chips. Same data, same semantics, restyled with CSS only
* Larger touch targets throughout; safe-area padding for the iOS home indicator; `dvh`-based viewport height

---

## Search bar

* Text search across book title and author
* Fuzzy matching (1 edit) plus wildcard prefix matching (`murder` → `murderbot`) via Atlas Search
* Debounced 400ms — one request per pause in typing
* Clear (×) button appears while text is present

## Rating / sort controls

* **Min avg rating** presets: Any, ≥ 3, ≥ 3.5, ≥ 4, ≥ 4.25, ≥ 4.5
* **Min ratings count** presets: Any, ≥ 1,000, ≥ 10,000, ≥ 100,000, ≥ 500,000
* **Sort by**: Avg rating (default, desc), Num ratings, Title, Search rank — plus an asc/desc direction toggle
* "Search rank" sorts by Atlas Search relevance when a text query is present; without one it falls back to avg rating

## Genre tag panel

Steam-style three-state tags — see `genre-filtering-logic.md` for the full semantics.

* Every genre row: include checkbox · name · book count (neutral rows only) · exclude minus
* Active genres pin to the top **in the order they were selected**
* A filter box narrows the list; active genres always stay visible
* Counts reflect the current genre/rating filters (not the text query)
* Merged genres appear under their canonical name only (see `data-model.md` → genreAliases)

## Stats bar

* **Matching** — live count for the current filters
* **Books shelved** — total dataset size

## Results

* 25 books per page
* Title links to the Goodreads page (new tab)
* Up to 5 genre chips per book, then a `+N` overflow marker; chips show merged (canonical) names
* Loading spinner during fetches; explicit empty state when nothing matches

## Pagination

* Previous / next arrows plus windowed page numbers (current ±1, with ellipses, first and last always shown)
* Changing any filter resets to page 1; changing pages preserves all filters
