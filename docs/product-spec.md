# product-spec.md

## Product Vision

A genre-first book discovery web application that allows users to explore books using **combinatorial genre filtering**, rating thresholds, and deterministic sorting — powered by a **curated, append-only Goodreads-derived dataset**.

The application prioritizes:

* Precision over recommendations
* Transparency over personalization
* Curation over real-time scraping

---

## Goals

* Enable powerful multi-genre (INCLUDE / EXCLUDE) discovery with Steam-style tag filtering UX
* Provide fast, deterministic filtering and sorting
* Maintain a clean, ever-growing dataset
* Separate public browsing from scraping concerns entirely

---

## Non-Goals

* No user accounts
* No recommendations or ML ranking
* No live Goodreads calls from public pages
* No book deletion
* No genre deletion or genre normalization (genres only ever expand)
* No visiting individual Goodreads book detail pages

---

## Core Invariants

* **Book URL is the global unique identifier**
* Goodreads **book detail pages are never visited** — all data comes from genre shelf pages
* A book's genre list is built by accumulation: every genre shelf page it appears on adds that genre
* Goodreads genre shelf pages are never re-scraped unless the override flag is set explicitly
* Dataset only **grows** — books and genres are never deleted
* Genres are never normalized automatically; only explicit admin-defined aliases are applied

---

## Pages

* `/` → Main discovery page (public)
* `/admin` → Admin-only scraping & maintenance UI (authenticated)

---

## Data Source

* **Scraping source**: `https://www.goodreads.com/shelf/show/{genre}?page={n}`
* All fields (title, author, avgRating, numRatings) are extracted from shelf pages
* Genre association comes from **which shelf page a book was found on**, not from the book itself
* Existing dataset bootstrapped from `books_raw.jl` (~46k books) via one-time migration
