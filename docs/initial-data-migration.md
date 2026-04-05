# initial-data-migration.md

One-time bootstrap migration from `books_raw.jl` into the strict MongoDB schema.

**Source file**: `/Users/kardeepakkumar/everything/others/goodreads-advanced-search/books_raw.jl`
**Source format**: JSON Lines (~46k lines), one book per line

Input field names and types:
* `Link` (string) — Goodreads book URL
* `Title` (string) — includes edition in parentheses e.g. `"Steve Jobs (Hardcover)"`
* `Author` (string)
* `Avg Rating` (string) — needs `toDouble`
* `Num Ratings` (string) — plain integer string (no commas in source), needs `toLong`
* `Genres` (array of strings)

---

## Full setup sequence

Run these in order. Do not start the migration before steps 1–3 of `mongo-setup.md` are complete — the `$merge` stage requires the unique index on `goodreadsUrl` to exist in the `books` collection.

```
1. mongo-setup.md  steps 1–3   (connect, create collections, create indexes)
2. This file       steps 0–4   (import, transform, populate genres, verify)
3. mongo-setup.md  step  4     (create Atlas Search index — must be after data is loaded)
4. This file       step  5     (optional cleanup)
```

---

## Step 0: Create the raw staging collection

```javascript
use("goodreadsBooks");
db.createCollection("booksRaw");
```

---

## Step 1: Import the source file into `booksRaw`

```bash
mongoimport \
  --uri "mongodb+srv://<DB_USER>:<DB_PASSWORD>@<CLUSTER_HOST>/goodreadsBooks" \
  --collection booksRaw \
  --file "/Users/kardeepakkumar/everything/others/goodreads-advanced-search/books_raw.jl" \
  --type json
```

Sanity checks:

```javascript
use("goodreadsBooks");

db.booksRaw.estimatedDocumentCount();  // expect ~46k

db.booksRaw.findOne({}, {
  Link: 1, Title: 1, Author: 1, "Avg Rating": 1, "Num Ratings": 1, Genres: 1
});
```

Check for duplicate URLs (must be zero before proceeding):

```javascript
db.booksRaw.aggregate([
  { $group: { _id: "$Link", count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
  { $count: "duplicateUrls" }
]);
// Expected: no documents returned (zero duplicates)
```

If duplicates exist, the transform pipeline handles them correctly via the `$group` stage (step 2). Review any duplicates manually before proceeding.

---

## Step 2: Transform `booksRaw` → `books`

Key transformations:
* `goodreadsUrl` ← `Link`
* `title` ← `Title` (raw, including edition suffix)
* `author` ← `Author`
* `avgRating` ← `toDouble("Avg Rating")`, defaults to `0.0` if missing
* `numRatings` ← strip non-digits, cast to long, defaults to `0` if missing
* `genres` ← deduplicated array via `$setUnion`
* `genresAutocomplete` ← mirrors `genres`
* `firstSeenGenre` ← alphabetically first genre after dedup (no true "first seen" in source data)
* `schemaVersion` ← `1`
* `createdAt`, `updatedAt` ← `$$NOW`
* `_id` ← auto-generated ObjectId (suppressed in pipeline so MongoDB generates a fresh one)

```javascript
use("goodreadsBooks");

db.booksRaw.aggregate([
  // --- 1. Normalize fields per source document ---
  {
    $project: {
      _id: 0,                         // suppress booksRaw _id; MongoDB generates a fresh ObjectId on insert
      goodreadsUrl: "$Link",
      title: "$Title",
      author: "$Author",
      avgRating: {
        $ifNull: [{ $toDouble: "$Avg Rating" }, 0.0]
      },
      numRatings: {
        $toLong: {
          $ifNull: [
            {
              $regexReplace: {
                input: { $toString: { $ifNull: ["$Num Ratings", "0"] } },
                regex: /[^0-9]/g,
                replacement: ""
              }
            },
            "0"
          ]
        }
      },
      genres: {
        $map: {
          input: { $ifNull: ["$Genres", []] },
          as: "g",
          in: { $toString: "$$g" }
        }
      }
    }
  },

  // --- 2. Group by URL to collapse any duplicate source records ---
  // Merges genre arrays across duplicates; keeps first title/author/ratings seen.
  {
    $group: {
      _id: "$goodreadsUrl",
      title:      { $first: "$title" },
      author:     { $first: "$author" },
      avgRating:  { $first: "$avgRating" },
      numRatings: { $max:   "$numRatings" },
      genres:     { $push:  "$genres" }   // array of arrays; flattened below
    }
  },

  // --- 3. Flatten and deduplicate genres, add remaining fields ---
  {
    $addFields: {
      goodreadsUrl: "$_id",
      genres: {
        $setUnion: [
          {
            $reduce: {
              input: "$genres",
              initialValue: [],
              in: { $concatArrays: ["$$value", "$$this"] }
            }
          },
          []
        ]
      },
      schemaVersion: { $literal: 1 },
      createdAt: "$$NOW",
      updatedAt: "$$NOW"
    }
  },

  // --- 4. Remove the _id produced by $group and add remaining derived fields ---
  {
    $project: {
      _id: 0,
      goodreadsUrl: 1,
      title: 1,
      author: 1,
      avgRating: 1,
      numRatings: 1,
      genres: 1,
      genresAutocomplete: "$genres",
      firstSeenGenre: { $arrayElemAt: ["$genres", 0] },
      schemaVersion: 1,
      createdAt: 1,
      updatedAt: 1
    }
  },

  // --- 5. Write to books (insert new, merge if URL already exists) ---
  {
    $merge: {
      into: "books",
      on: "goodreadsUrl",
      whenMatched: "keepExisting",   // if re-run, don't overwrite existing books
      whenNotMatched: "insert"
    }
  }
], { allowDiskUse: true });
```

> `whenMatched: "keepExisting"` means re-running the migration is safe — it will only insert books not already present.
> MongoDB auto-generates a fresh ObjectId `_id` for each inserted document (since `_id: 0` in the pipeline).

Post-checks:

```javascript
use("goodreadsBooks");

db.books.estimatedDocumentCount();  // expect ~46k (minus any dropped empty-genre books)

db.books.findOne({}, {
  _id: 1, goodreadsUrl: 1, title: 1, author: 1,
  avgRating: 1, numRatings: 1, genres: 1,
  genresAutocomplete: 1, firstSeenGenre: 1,
  schemaVersion: 1, createdAt: 1, updatedAt: 1
});

// Verify no books slipped through with empty genres
db.books.countDocuments({ genres: { $size: 0 } });  // expect 0

// Verify genresAutocomplete always mirrors genres
db.books.countDocuments({
  $expr: { $ne: [{ $size: "$genres" }, { $size: "$genresAutocomplete" }] }
});  // expect 0
```

---

## Step 3: Populate `genres` from `books`

```javascript
use("goodreadsBooks");

db.books.aggregate([
  { $unwind: "$genres" },
  {
    $group: {
      _id: "$genres",
      createdAt: { $first: "$$NOW" },
      updatedAt: { $first: "$$NOW" }
    }
  },
  {
    $project: {
      _id: 1,
      schemaVersion: { $literal: 1 },
      createdAt: 1,
      updatedAt: 1
    }
  },
  {
    $merge: {
      into: "genres",
      on: "_id",
      whenMatched: "keepExisting",
      whenNotMatched: "insert"
    }
  }
], { allowDiskUse: true });
```

Post-check:

```javascript
db.genres.estimatedDocumentCount();
db.genres.find().sort({ _id: 1 }).limit(10);
```

---

## Step 4: Verify indexes

```javascript
db.books.getIndexes();
// Must include: { goodreadsUrl: 1 } unique: true
```

---

## Step 5: Create Atlas Search Index

Once `books` is populated, create the Atlas Search index as described in `mongo-setup.md` section 4.

**Wait for the index to become active before using the app.** Check status:

```bash
atlas clusters search indexes list \
  --clusterName <CLUSTER_NAME> \
  --projectId <PROJECT_ID>
# Wait until status shows "READY" (not "BUILDING")
```

For ~46k books this typically takes 2–5 minutes.

---

## Step 6: Cleanup (optional)

After verifying data is correct:

```javascript
use("goodreadsBooks");
db.booksRaw.drop();
```
