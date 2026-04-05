// Transforms booksRaw → books using the full aggregation pipeline.
// Requires: 02-create-collections.js and 03-create-indexes.js already run.
// Run: mongosh "$MONGODB_URI" --file migration/data-import/06-transform-to-books.js

use("goodreadsBooks");

const before = db.books.estimatedDocumentCount();
print("books count before: " + before);

print("Running transform pipeline (allowDiskUse)...");

db.booksRaw.aggregate([
  // 1. Normalize fields per source document
  {
    $project: {
      _id: 0,                    // suppress booksRaw _id; MongoDB generates fresh ObjectId on insert
      goodreadsUrl: "$Link",
      title: "$Title",
      author: "$Author",
      avgRating: {
        $ifNull: [{ $toDouble: "$Avg Rating" }, 0.0]
      },
      numRatings: {
        // Source data has plain integer strings (no commas) — $toLong converts directly.
        // $toInt first caps at int32 max; $toLong handles the full range needed.
        $toLong: { $ifNull: ["$Num Ratings", "0"] }
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

  // 2. Group by URL — collapses any duplicate source records, merges genre arrays
  {
    $group: {
      _id:        "$goodreadsUrl",
      title:      { $first: "$title" },
      author:     { $first: "$author" },
      avgRating:  { $first: "$avgRating" },
      numRatings: { $max:   "$numRatings" },
      genres:     { $push:  "$genres" }    // array of arrays; flattened next
    }
  },

  // 3. Flatten + deduplicate genres
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

  // 4. Final shape — suppress $group's _id, add derived fields
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

  // 5. Write to books — keepExisting makes reruns safe
  {
    $merge: {
      into: "books",
      on: "goodreadsUrl",
      whenMatched: "keepExisting",
      whenNotMatched: "insert"
    }
  }
], { allowDiskUse: true });

const after = db.books.estimatedDocumentCount();
print("books count after:  " + after);
print("documents inserted: " + (after - before));

print("\nSample document:");
printjson(db.books.findOne({}, {
  _id: 1, goodreadsUrl: 1, title: 1, author: 1,
  avgRating: 1, numRatings: 1, genres: 1,
  firstSeenGenre: 1, schemaVersion: 1
}));

print("\nSanity checks:");
const emptyGenres = db.books.countDocuments({ genres: { $size: 0 } });
print("  Books with empty genres: " + emptyGenres + " (expect 0)");

const mismatch = db.books.countDocuments({
  $expr: { $ne: [{ $size: "$genres" }, { $size: "$genresAutocomplete" }] }
});
print("  genres/genresAutocomplete mismatch: " + mismatch + " (expect 0)");

const nullFirstSeen = db.books.countDocuments({ firstSeenGenre: null });
print("  Null firstSeenGenre: " + nullFirstSeen + " (expect 0)");
