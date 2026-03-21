import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGO_URI || "mongodb+srv://jonathan_db_user:06ezylmc8aMBDyB1@ek24-database.ujhnyck.mongodb.net/?appName=ek24-database";
const dbName = process.env.MONGO_DB || "ek24-database";

let client: MongoClient;
let db: Db;

export async function connectDb(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  await db.collection("cells").createIndex({ id: 1 }, { unique: true });
  await db.collection("cells").createIndex({ x: 1, y: 1 }, { unique: true });
  console.log(`[db] connected to ${dbName}`);
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error("Database not connected — call connectDb() first");
  return db;
}
