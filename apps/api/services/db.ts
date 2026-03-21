import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGO_URI || "mongodb://localhost:27017";
const dbName = process.env.MONGO_DB || "game3026";

let client: MongoClient;
let db: Db;

export async function connectDb(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  console.log(`[db] connected to ${dbName}`);
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error("Database not connected — call connectDb() first");
  return db;
}
