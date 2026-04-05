# main-page-ui.md

## Layout Overview

* **Top bar**: Search input, dataset counters, reset button, theme toggle
* **Left / main area**: Book results table
* **Right panel**: Filters (ratings + genre tag panel)

---

## Top Bar

### Search Bar

* Text search across: book title, author
* Behavior: case-insensitive, accent-insensitive, fuzzy matching
* Empty by default

### Sorting Interaction

* Default sort: `Avg Rating DESC`
* When search text is present: default sort switches to `search_rank DESC`
* User can override sort via column header clicks at any time

### Result Counters

* **Total books in dataset** — static count of all books
* **Books matching current filters** — live count, updates with every filter change

### Reset Button

* Clears all active filters (genres, ratings, search text) back to defaults

---

## Right Panel: Filters

### Rating Filters

| Filter | Default Min | Default Max |
|---|---|---|
| Average Rating | 3.0 | 5.0 |
| Number of Ratings | 1,000 | ∞ |

Each filter has:
* A range slider
* Numeric input fields for precision entry

---

### Genre Tag Panel

Modelled after Steam's "Narrow by tag" panel.

#### Structure

The panel has two sections:

**1. Active Filters (top, highlighted in blue)**
* Contains all genres currently in included or excluded state
* Included genres: checkbox checked + highlight
* Excluded genres: minus (−) icon active + highlight, checkbox unchecked
* These remain visible here until deactivated
* Order: included genres first, then excluded genres

**2. Neutral Genres (below)**
* Top 15–20 genres by descending book count under all current filters
* Each row: `[ checkbox ]  Genre Name  count  [ − ]`
* Count shown inline in a smaller/italic style
* Genres already in the active section are not repeated here

#### Interactions

* **Click checkbox** → toggles genre between neutral and included
* **Click minus (−)** → toggles genre between neutral and excluded
* A genre cannot be both included and excluded

#### Genre Search Bar

* Located at the bottom of the genre panel
* Autocomplete via Atlas Search prefix matching against the `genres` collection
* Selecting a genre from autocomplete adds it to the include list
* Allows activating any genre not currently visible in the top-N list

---

## Results Table

### Columns

| Column | Sortable |
|---|---|
| Book Name (links to Goodreads) | Yes |
| Author | Yes |
| Avg Rating | Yes (default DESC) |
| Num Ratings | Yes |

### Sorting

* Click any column header to sort ascending; click again for descending
* Active sort column is visually indicated

---

## Pagination

* 20 books per page
* Navigation: Previous / Next, First / Last, windowed page numbers (current ±2)

---

## Theme

* Default: dark mode
* Toggle in top-right corner
* Light mode available
