import { MongoClient, Db } from 'mongodb'

const uri = process.env.MONGODB_URI
if (!uri) throw new Error('MONGODB_URI env var is not set')

const DB_NAME = 'goodreadsBooks'

// Reuse the connection across hot-reloads in development
declare global {
  // eslint-disable-next-line no-var
  var _mongoClient: MongoClient | undefined
}

let client: MongoClient

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClient) {
    global._mongoClient = new MongoClient(uri)
  }
  client = global._mongoClient
} else {
  client = new MongoClient(uri)
}

export async function getDb(): Promise<Db> {
  await client.connect()
  return client.db(DB_NAME)
}
