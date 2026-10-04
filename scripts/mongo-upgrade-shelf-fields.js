// One-time schema upgrade for scraper v2 (shelf fields + re-scrape migration).
//
// The strict validators (additionalProperties: false) reject any field they
// don't list, so they must learn the new optional fields BEFORE the v2 code
// writes them:
//   books:      publishedYear, coverUrl, authorUrl, shelvedCounts
//   scrapeJobs: scraperVersion, kind
//
// Run against the live database before deploying:
//   mongosh "$MONGODB_URI" --file scripts/mongo-upgrade-shelf-fields.js
//
// Safe to re-run: collMod swaps in the full validator below, identical to
// docs/mongo-setup.md §2.1 and §2.4. Existing documents stay valid — every
// new field is optional.

use("goodreadsBooks");

const booksSchema = {
  bsonType: "object",
  additionalProperties: false,
  required: [
    "_id",
    "goodreadsUrl",
    "title",
    "author",
    "avgRating",
    "numRatings",
    "genres",
    "genresAutocomplete",
    "firstSeenGenre",
    "schemaVersion",
    "createdAt",
    "updatedAt"
  ],
  properties: {
    _id:                  { bsonType: "objectId" },
    goodreadsUrl:         { bsonType: "string", minLength: 1 },
    title:                { bsonType: "string", minLength: 1 },
    author:               { bsonType: "string", minLength: 1 },
    avgRating:            { bsonType: ["double", "int", "long", "decimal"], minimum: 0, maximum: 5 },
    numRatings:           { bsonType: ["int", "long"], minimum: 0 },
    genres: {
      bsonType: "array", minItems: 1, uniqueItems: true,
      items: { bsonType: "string", minLength: 1 }
    },
    genresAutocomplete: {
      bsonType: "array", minItems: 1, uniqueItems: true,
      items: { bsonType: "string", minLength: 1 }
    },
    firstSeenGenre:       { bsonType: "string", minLength: 1 },
    // Shelf fields (scraper v2) — optional, absent on books not yet re-scraped
    publishedYear:        { bsonType: ["int", "long"] },
    coverUrl:             { bsonType: "string", minLength: 1 },
    authorUrl:            { bsonType: "string", minLength: 1 },
    shelvedCounts: {
      bsonType: "object",
      additionalProperties: { bsonType: ["int", "long"], minimum: 0 }
    },
    schemaVersion:        { bsonType: "int", minimum: 1 },
    createdAt:            { bsonType: "date" },
    updatedAt:            { bsonType: "date" }
  }
};

const scrapeJobsSchema = {
  bsonType: "object",
  additionalProperties: false,
  required: [
    "_id", "genre", "startPage", "currentPage", "maxPage",
    "pagesScraped", "status", "override", "schemaVersion", "createdAt", "updatedAt"
  ],
  properties: {
    _id:            { bsonType: "objectId" },
    genre:          { bsonType: "string", minLength: 1 },
    requestedGenre: { bsonType: ["string", "null"] },
    startPage:      { bsonType: "int", minimum: 1 },
    currentPage:    { bsonType: "int", minimum: 1 },
    maxPage:        { bsonType: "int", minimum: 1 },
    pagesScraped:   { bsonType: "int", minimum: 0 },
    status:         { enum: ["queued", "running", "failed", "done"] },
    override:       { bsonType: "bool" },
    lastRequestAt:  { bsonType: ["date", "null"] },
    error:          { bsonType: ["object", "string", "null"] },
    // Scraper v2 — optional, absent on jobs created before it
    scraperVersion: { bsonType: "int", minimum: 1 },
    kind:           { enum: ["manual", "backfill"] },
    schemaVersion:  { bsonType: "int", minimum: 1 },
    createdAt:      { bsonType: "date" },
    updatedAt:      { bsonType: "date" }
  }
};

for (const [name, schema] of [["books", booksSchema], ["scrapeJobs", scrapeJobsSchema]]) {
  const res = db.runCommand({
    collMod: name,
    validator: { $jsonSchema: schema },
    validationLevel: "strict",
    validationAction: "error"
  });
  if (res.ok !== 1) {
    printjson(res);
    throw new Error(`collMod ${name} failed`);
  }
  const props = Object.keys(db.getCollectionInfos({ name })[0].options.validator.$jsonSchema.properties);
  print(`${name}: validator updated (${props.length} properties: ${props.join(", ")})`);
}

print("\nDone. Deploy the v2 code, then queue the re-scrape from the admin panel.");
