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
  await db.collection("confirmed_refuel").createIndex({ x: 1, y: 1 }, { unique: true });
  await db.collection("bot_orders").createIndex({ status: 1, createdAt: 1 });
  await db.collection("bot_stats").createIndex({ timestamp: -1 });
  // HOME est toujours un refuel confirmé
  await db.collection("confirmed_refuel").updateOne(
    { x: 5, y: 3 },
    { $set: { x: 5, y: 3, confirmedAt: new Date() } },
    { upsert: true },
  );
  // NOTE: plus de seed SAND KNOWN → confirmed_refuel.
  // KNOWN ≠ recharge le fuel (ex: îles zone 3 ne rechargent pas).
  // Seul ship:move (energy augmente) écrit dans confirmed_refuel.
  console.log(`[db] connected to ${dbName}`);
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error("Database not connected — call connectDb() first");
  return db;
}
