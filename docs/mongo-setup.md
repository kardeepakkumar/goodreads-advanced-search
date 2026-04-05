# mongo-setup.md

## Assumptions

* Atlas cluster already exists
* You have: cluster name, project ID, DB user, DB password
* Atlas CLI is installed and authenticated
* Target database: `goodreadsBooks`

---

## 1) Connect with mongosh

```bash
mongosh "mongodb+srv://<CLUSTER_NAME>.mongodb.net/goodreadsBooks" \
  --username <DB_USER>
```

Enter password when prompted.

---

## 2) Create Collections with Strict Schema Validation

### 2.1 books

```javascript
use("goodreadsBooks");

db.createCollection("books", {
  validator: {
    $jsonSchema: {
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
        schemaVersion:        { bsonType: "int", minimum: 1 },
        createdAt:            { bsonType: "date" },
        updatedAt:            { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
```

### 2.2 genres

```javascript
db.createCollection("genres", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      additionalProperties: false,
      required: ["_id", "schemaVersion", "createdAt", "updatedAt"],
      properties: {
        _id:          { bsonType: "string", minLength: 1 },
        schemaVersion:{ bsonType: "int", minimum: 1 },
        createdAt:    { bsonType: "date" },
        updatedAt:    { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
```

### 2.3 genreAliases

```javascript
db.createCollection("genreAliases", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      additionalProperties: false,
      required: ["_id", "canonical", "schemaVersion", "createdAt", "updatedAt"],
      properties: {
        _id:          { bsonType: "string", minLength: 1 },  // the alias slug
        canonical:    { bsonType: "string", minLength: 1 },  // target slug in genres collection
        schemaVersion:{ bsonType: "int", minimum: 1 },
        createdAt:    { bsonType: "date" },
        updatedAt:    { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
```

### 2.4 scrapeJobs

```javascript
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
```

### 2.5 appConfig

```javascript
db.createCollection("appConfig", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      additionalProperties: false,
      required: ["_id", "goodreadsCookie", "rateLimitMs", "schemaVersion", "updatedAt"],
      properties: {
        _id:              { bsonType: "string" },        // always "global"
        goodreadsCookie:  { bsonType: "string" },
        rateLimitMs:      { bsonType: "int", minimum: 1000 },
        schemaVersion:    { bsonType: "int", minimum: 1 },
        updatedAt:        { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

// Seed the singleton config document
db.appConfig.insertOne({
  _id: "global",
  goodreadsCookie: "",
  rateLimitMs: 3000,
  schemaVersion: 1,
  updatedAt: new Date()
});
```

---

## 3) Create Indexes

```javascript
// books: unique URL constraint (primary application key)
db.books.createIndex({ goodreadsUrl: 1 }, { unique: true, name: "uniq_goodreadsUrl" });

// scrapeJobs: queue management lookups
db.scrapeJobs.createIndex({ status: 1, createdAt: 1 }, { name: "jobs_by_status_createdAt" });
db.scrapeJobs.createIndex({ genre: 1, status: 1 },     { name: "jobs_by_genre_status" });

// genreAliases: reverse lookup (find all aliases for a canonical genre)
db.genreAliases.createIndex({ canonical: 1 }, { name: "aliases_by_canonical" });
```

---

## 4) Create the Atlas Search Index

### 4.1 Create the index definition file

Create `books-search-index.json`:

```json
{
  "name": "books_search_v1",
  "database": "goodreadsBooks",
  "collectionName": "books",
  "mappings": {
    "dynamic": false,
    "fields": {
      "title": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "author": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "genres": {
        "type": "string",
        "analyzer": "lucene.keyword"
      },
      "genresAutocomplete": {
        "type": "autocomplete",
        "tokenization": "edgeGram",
        "minGrams": 1,
        "maxGrams": 20,
        "foldDiacritics": true
      },
      "avgRating": {
        "type": "number"
      },
      "numRatings": {
        "type": "number"
      }
    }
  }
}
```

Notes:
* `genres` uses `lucene.keyword` for exact match filtering (include/exclude)
* `genresAutocomplete` uses `edgeGram` autocomplete for prefix search in the genre search bar
* `title` and `author` use `lucene.standard` for fuzzy full-text search

### 4.2 Create the index (Atlas CLI)

```bash
atlas clusters search indexes create \
  --clusterName <CLUSTER_NAME> \
  --projectId <PROJECT_ID> \
  --file ./books-search-index.json
```

### 4.3 Verify — wait for READY status

```bash
atlas clusters search indexes list \
  --clusterName <CLUSTER_NAME> \
  --projectId <PROJECT_ID>
```

The index builds asynchronously. Status will show `BUILDING` initially, then `READY` when ready. **Do not use the app until the status is `READY`** — `$search` queries return empty results while the index is building. For ~46k books expect 2–5 minutes.

---

## 5) Operational Notes

* All user-facing filtering/sorting/faceting uses Atlas Search via `$search`, even when search text is empty
* Genre facet counts are computed live per request via Atlas Search facets
* All writes must set `schemaVersion`, `createdAt` (insert only), `updatedAt` (every write)
* Use `$addToSet` for `genres` and `genresAutocomplete` — never overwrite the full array
