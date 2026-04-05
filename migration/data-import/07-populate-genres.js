// Populates the genres collection from all genres present in books.
// Run AFTER 06-transform-to-books.js.
// Run: mongosh "$MONGODB_URI" --file migration/data-import/07-populate-genres.js

use("goodreadsBooks");

const before = db.genres.estimatedDocumentCount();
print("genres count before: " + before);

print("Running genres aggregation...");

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

const after = db.genres.estimatedDocumentCount();
print("genres count after:  " + after);
print("genres inserted:     " + (after - before));

print("\nAll genres (sorted):");
db.genres.find().sort({ _id: 1 }).forEach(g => print("  " + g._id));
