// Seeds the singleton appConfig document.
// Run AFTER 02-create-collections.js.
// Run: mongosh "$MONGODB_URI" --file migration/setup/04-seed-appconfig.js

use("goodreadsBooks");

print("Seeding appConfig...");

const result = db.appConfig.updateOne(
  { _id: "global" },
  {
    $setOnInsert: {
      _id: "global",
      goodreadsCookie: "",
      rateLimitMs: 3000,
      schemaVersion: 1,
      updatedAt: new Date()
    }
  },
  { upsert: true }
);

if (result.upsertedCount === 1) {
  print("  OK: appConfig document inserted");
} else {
  print("  SKIPPED: appConfig document already exists");
}

printjson(db.appConfig.findOne({ _id: "global" }));
