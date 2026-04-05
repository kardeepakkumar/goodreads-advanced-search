// Final verification after the full migration.
// Run: mongosh "$MONGODB_URI" --file migration/data-import/08-verify-migration.js

use("goodreadsBooks");

print("=== Migration Verification ===\n");

// Collection counts
print("--- Collection counts ---");
print("  books:         " + db.books.estimatedDocumentCount());
print("  genres:        " + db.genres.estimatedDocumentCount());
print("  genreAliases:  " + db.genreAliases.estimatedDocumentCount());
print("  scrapeJobs:    " + db.scrapeJobs.estimatedDocumentCount());
print("  appConfig:     " + db.appConfig.estimatedDocumentCount());
print("  booksRaw:      " + (db.getCollectionNames().includes("booksRaw") ? db.booksRaw.estimatedDocumentCount() : "(dropped)"));

// Schema integrity
print("\n--- Schema integrity ---");
print("  Books with empty genres:              " + db.books.countDocuments({ genres: { $size: 0 } })           + " (expect 0)");
print("  Books with null firstSeenGenre:       " + db.books.countDocuments({ firstSeenGenre: null })           + " (expect 0)");
print("  genres/autocomplete size mismatch:    " + db.books.countDocuments({
  $expr: { $ne: [{ $size: "$genres" }, { $size: "$genresAutocomplete" }] }
}) + " (expect 0)");
print("  Books with missing goodreadsUrl:      " + db.books.countDocuments({ goodreadsUrl: { $exists: false } }) + " (expect 0)");

// Rating distribution
print("\n--- Rating distribution (sample) ---");
const ratings = db.books.aggregate([
  {
    $bucket: {
      groupBy: "$avgRating",
      boundaries: [0, 1, 2, 3, 3.5, 4, 4.5, 5.01],
      default: "other",
      output: { count: { $sum: 1 } }
    }
  }
]).toArray();
ratings.forEach(b => print("  " + b._id + " – " + b.count + " books"));

// Top genres by book count
print("\n--- Top 20 genres by book count ---");
db.books.aggregate([
  { $unwind: "$genres" },
  { $group: { _id: "$genres", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 20 }
]).forEach(g => print("  " + g._id.padEnd(30) + g.count));

// appConfig state
print("\n--- appConfig ---");
printjson(db.appConfig.findOne({ _id: "global" }));

// Index summary
print("\n--- Indexes on books ---");
db.books.getIndexes().forEach(i => print("  " + i.name + " | " + JSON.stringify(i.key) + (i.unique ? " | UNIQUE" : "")));
