// Creates all regular MongoDB indexes.
// Run AFTER 02-create-collections.js.
// Atlas Search index is separate (migration/search/ scripts).
// Run: mongosh "$MONGODB_URI" --file migration/setup/03-create-indexes.js

use("goodreadsBooks");

print("Creating indexes...");

// books: primary application lookup key + uniqueness enforcement
db.books.createIndex(
  { goodreadsUrl: 1 },
  { unique: true, name: "uniq_goodreadsUrl" }
);
print("  OK: books.goodreadsUrl (unique)");

// scrapeJobs: queue management — fetch queued/running jobs in order
db.scrapeJobs.createIndex(
  { status: 1, createdAt: 1 },
  { name: "jobs_by_status_createdAt" }
);
print("  OK: scrapeJobs.status+createdAt");

// scrapeJobs: duplicate-job prevention before enqueueing
db.scrapeJobs.createIndex(
  { genre: 1, status: 1 },
  { name: "jobs_by_genre_status" }
);
print("  OK: scrapeJobs.genre+status");

// genreAliases: reverse lookup (find all aliases pointing to a canonical genre)
db.genreAliases.createIndex(
  { canonical: 1 },
  { name: "aliases_by_canonical" }
);
print("  OK: genreAliases.canonical");

print("\nAll indexes created. Verify:");
print("books:");
printjson(db.books.getIndexes().map(i => ({ name: i.name, key: i.key, unique: i.unique })));
print("scrapeJobs:");
printjson(db.scrapeJobs.getIndexes().map(i => ({ name: i.name, key: i.key })));
print("genreAliases:");
printjson(db.genreAliases.getIndexes().map(i => ({ name: i.name, key: i.key })));
