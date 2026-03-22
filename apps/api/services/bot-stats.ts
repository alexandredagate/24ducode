import { getDb } from "./db";

const COLLECTION = "bot_stats";

export interface BotSnapshot {
  timestamp: Date;
  // Position
  position: { x: number; y: number } | null;
  zone: number;
  energy: number;
  maxEnergy: number;
  // Ship
  shipLevel: number;
  // Activity
  status: string; // "exploring" | "refueling" | "order" | "stranded" | "zone_escape" | "idle"
  totalMoves: number;
  islandsFound: number;
  islandVisits: number;
  refuelIslandsCount: number;
  blockedCellsCount: number;
  // Player (enrichi périodiquement)
  quotient?: number;
  money?: number;
  resources?: Record<string, number>;
  knownIslandsCount?: number;
  // Path
  pathReason: string;
  pathLength: number;
  // Order
  currentOrderId?: string;
  currentOrderTarget?: { x: number; y: number };
}

/** Sauvegarde un snapshot du bot. */
export async function saveBotSnapshot(snapshot: BotSnapshot): Promise<void> {
  const col = getDb().collection(COLLECTION);
  await col.insertOne(snapshot);
}

/** Récupère les N derniers snapshots. */
export async function getRecentSnapshots(limit = 100): Promise<BotSnapshot[]> {
  const col = getDb().collection(COLLECTION);
  const docs = await col.find({}).sort({ timestamp: -1 }).limit(limit).toArray();
  return docs as unknown as BotSnapshot[];
}

/** Récupère le dernier snapshot (état actuel). */
export async function getLatestSnapshot(): Promise<BotSnapshot | null> {
  const col = getDb().collection(COLLECTION);
  const doc = await col.findOne({}, { sort: { timestamp: -1 } });
  return doc as unknown as BotSnapshot | null;
}

/** Récupère les snapshots sur une période. */
export async function getSnapshotsSince(since: Date): Promise<BotSnapshot[]> {
  const col = getDb().collection(COLLECTION);
  const docs = await col.find({ timestamp: { $gte: since } }).sort({ timestamp: 1 }).toArray();
  return docs as unknown as BotSnapshot[];
}

/** Nettoie les vieux snapshots (garde les 24 dernières heures). */
export async function cleanOldSnapshots(): Promise<number> {
  const col = getDb().collection(COLLECTION);
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await col.deleteMany({ timestamp: { $lt: cutoff } });
  return result.deletedCount;
}
