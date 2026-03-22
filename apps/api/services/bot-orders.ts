import { getDb } from "./db";
import { ObjectId } from "mongodb";

const COLLECTION = "bot_orders";

export type OrderAction = "move";
export type OrderStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface BotOrder {
  _id?: ObjectId;
  id: string;
  action: OrderAction;
  payload: Record<string, unknown>;
  status: OrderStatus;
  progress?: {
    message: string;
    current?: { x: number; y: number };
    target: { x: number; y: number };
    stepsRemaining: number;
    stepsTotal: number;
  };
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string;
}

/** Crée un nouvel ordre pour le bot. */
export async function createOrder(action: OrderAction, payload: Record<string, unknown>): Promise<BotOrder> {
  const col = getDb().collection(COLLECTION);
  const id = new ObjectId().toHexString();
  const order: BotOrder = {
    id,
    action,
    payload,
    status: "PENDING",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await col.insertOne(order);
  return order;
}

/** Annule tous les ordres en attente ou en cours. */
export async function cancelAllOrders(): Promise<number> {
  const col = getDb().collection(COLLECTION);
  const result = await col.updateMany(
    { status: { $in: ["PENDING", "IN_PROGRESS"] } },
    { $set: { status: "CANCELLED", updatedAt: new Date() } },
  );
  return result.modifiedCount;
}

/** Récupère le prochain ordre PENDING (FIFO). */
export async function getNextPendingOrder(): Promise<BotOrder | null> {
  const col = getDb().collection(COLLECTION);
  const doc = await col.findOne(
    { status: "PENDING" },
    { sort: { createdAt: 1 } },
  );
  return doc as BotOrder | null;
}

/** Récupère l'ordre en cours. */
export async function getCurrentOrder(): Promise<BotOrder | null> {
  const col = getDb().collection(COLLECTION);
  const doc = await col.findOne({ status: "IN_PROGRESS" });
  return doc as BotOrder | null;
}

/** Met à jour le status d'un ordre. */
export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  extra?: Partial<Pick<BotOrder, "progress" | "error" | "completedAt">>,
): Promise<void> {
  const col = getDb().collection(COLLECTION);
  await col.updateOne(
    { id },
    { $set: { status, updatedAt: new Date(), ...extra } },
  );
}

/** Récupère un ordre par ID. */
export async function getOrder(id: string): Promise<BotOrder | null> {
  const col = getDb().collection(COLLECTION);
  return await col.findOne({ id }) as BotOrder | null;
}

/** Récupère les ordres récents (pour le dashboard). */
export async function getRecentOrders(limit = 10): Promise<BotOrder[]> {
  const col = getDb().collection(COLLECTION);
  const docs = await col.find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  return docs as BotOrder[];
}
