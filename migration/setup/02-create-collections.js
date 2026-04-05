// Creates all collections with strict schema validation.
// Run: mongosh "$MONGODB_URI" --file migration/setup/02-create-collections.js

use("goodreadsBooks");

// ----- books -----
print("Creating: books");
db.createCollection("books", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      additionalProperties: false,
      required: [
        "_id", "goodreadsUrl", "title", "author",
        "avgRating", "numRatings", "genres", "genresAutocomplete",
        "firstSeenGenre", "schemaVersion", "createdAt", "updatedAt"
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
        schemaVersion:        { bsonType: "int", minimum: 1 },
        createdAt:            { bsonType: "date" },
        updatedAt:            { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
print("  OK: books");

// ----- genres -----
print("Creating: genres");
db.createCollection("genres", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      additionalProperties: false,
      required: ["_id", "schemaVersion", "createdAt", "updatedAt"],
      properties: {
        _id:           { bsonType: "string", minLength: 1 },
        schemaVersion: { bsonType: "int", minimum: 1 },
        createdAt:     { bsonType: "date" },
        updatedAt:     { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
print("  OK: genres");

// ----- genreAliases -----
print("Creating: genreAliases");
db.createCollection("genreAliases", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      additionalProperties: false,
      required: ["_id", "canonical", "schemaVersion", "createdAt", "updatedAt"],
      properties: {
        _id:           { bsonType: "string", minLength: 1 },   // alias slug
        canonical:     { bsonType: "string", minLength: 1 },   // target slug
        schemaVersion: { bsonType: "int", minimum: 1 },
        createdAt:     { bsonType: "date" },
        updatedAt:     { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
print("  OK: genreAliases");

// ----- scrapeJobs -----
print("Creating: scrapeJobs");
db.createCollection("scrapeJobs", {
  validator: {
    $jsonSchema: {
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
        schemaVersion:  { bsonType: "int", minimum: 1 },
        createdAt:      { bsonType: "date" },
        updatedAt:      { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
print("  OK: scrapeJobs");

// ----- appConfig -----
print("Creating: appConfig");
db.createCollection("appConfig", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      additionalProperties: false,
      required: ["_id", "goodreadsCookie", "rateLimitMs", "schemaVersion", "updatedAt"],
      properties: {
        _id:             { bsonType: "string" },       // always "global"
        goodreadsCookie: { bsonType: "string" },
        rateLimitMs:     { bsonType: "int", minimum: 1000 },
        schemaVersion:   { bsonType: "int", minimum: 1 },
        updatedAt:       { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
print("  OK: appConfig");

print("\nAll collections created. Verify:");
print(JSON.stringify(db.getCollectionNames(), null, 2));
