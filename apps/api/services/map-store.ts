import { getDb } from "./db";
import type { Cell, CellNote, DiscoveryStatus } from "types";

const COLLECTION = "cells";
const SHIP_POSITION_COLLECTION = "ship_position";

// ─── MapGrid cache ──────────────────────────────────────────────────
// Invalidé à chaque mutation (upsertCells, validateDiscoveries, etc.)
let _gridCache: MapGrid | null = null;

export function invalidateGridCache(): void {
  _gridCache = null;
}

/** Known special locations: coordinate key "x,y" → note */
const KNOWN_NOTES = new Map<string, CellNote>([
  ["5,3", "HOME"],
]);

/** Cells that are always KNOWN (home island, etc.) */
const ALWAYS_KNOWN = new Set<string>(["5,3"]);

const CONFIRMED_REFUEL_COLLECTION = "confirmed_refuel";

// ─── Confirmed refuel islands ───────────────────────────────────────

/**
 * Marque une cellule SAND comme "refuel confirmé" (le bateau a rechargé ici).
 * C'est la seule source de vérité pour savoir si une île recharge.
 */
export async function markConfirmedRefuel(x: number, y: number): Promise<void> {
  const col = getDb().collection(CONFIRMED_REFUEL_COLLECTION);
  await col.updateOne({ x, y }, { $set: { x, y, confirmedAt: new Date() } }, { upsert: true });
  invalidateGridCache();
}

export async function getConfirmedRefuelCoords(): Promise<{ x: number; y: number }[]> {
  const col = getDb().collection(CONFIRMED_REFUEL_COLLECTION);
  const docs = await col.find({}).toArray();
  return docs.map((d) => ({ x: d.x, y: d.y }));
}

// ─── Ship position ──────────────────────────────────────────────────

export async function saveShipPosition(codingGameId: string, position: Cell, energy: number): Promise<void> {
  const col = getDb().collection(SHIP_POSITION_COLLECTION);
  await col.updateOne(
    { codingGameId },
    { $set: { codingGameId, position, energy, updatedAt: new Date() } },
    { upsert: true },
  );
}

export async function getShipPosition(codingGameId: string): Promise<{ position: Cell; energy: number } | null> {
  const col = getDb().collection(SHIP_POSITION_COLLECTION);
  const doc = await col.findOne({ codingGameId });
  if (!doc) return null;
  return { position: doc.position as Cell, energy: doc.energy as number };
}

// ─── Cell upsert with discovery status ──────────────────────────────

export async function upsertCells(cells: Cell[]): Promise<void> {
  if (!cells.length) return;
  const col = getDb().collection(COLLECTION);

  const ops = cells.map((cell) => {
    const key = `${cell.x},${cell.y}`;
    const note = cell.note ?? KNOWN_NOTES.get(key);

    // Champs toujours mis à jour
    const $set: Record<string, unknown> = {
      id: cell.id, x: cell.x, y: cell.y, type: cell.type, zone: cell.zone,
    };
    if (note) $set.note = note;

    // discoveryStatus : seulement les SAND ont un status
    // - ALWAYS_KNOWN → toujours KNOWN
    // - Sinon, on met DISCOVERED uniquement à l'insertion ($setOnInsert)
    //   pour ne pas écraser un KNOWN existant
    if (cell.type === "SAND") {
      if (ALWAYS_KNOWN.has(key)) {
        $set.discoveryStatus = "KNOWN";
      }
    }

    const $setOnInsert: Record<string, unknown> = {};
    if (cell.type === "SAND" && !ALWAYS_KNOWN.has(key)) {
      $setOnInsert.discoveryStatus = "DISCOVERED";
    }

    const update: Record<string, unknown> = { $set };
    if (Object.keys($setOnInsert).length > 0) {
      update.$setOnInsert = $setOnInsert;
    }

    return {
      updateOne: {
        filter: { x: cell.x, y: cell.y },
        update,
        upsert: true,
      },
    };
  });
  await col.bulkWrite(ops);
  invalidateGridCache();
}

// ─── Discovery validation ───────────────────────────────────────────

/**
 * Passe toutes les cellules DISCOVERED → KNOWN.
 * Appelé quand le bateau arrive sur une île déjà KNOWN.
 * Retourne le nombre de cellules validées.
 */
export async function validateDiscoveries(): Promise<number> {
  const col = getDb().collection(COLLECTION);
  const result = await col.updateMany(
    { type: "SAND", discoveryStatus: "DISCOVERED" },
    { $set: { discoveryStatus: "KNOWN" } },
  );
  if (result.modifiedCount > 0) invalidateGridCache();
  return result.modifiedCount;
}

/**
 * Synchronise le discoveryStatus des cellules SAND en DB
 * à partir de la liste des îles du player:details.
 *
 * Stratégie : on regroupe les cellules SAND par "île" (flood-fill via zone),
 * et on marque KNOWN les îles dont le nombre total correspond au nombre
 * d'îles KNOWN retourné par l'API.
 *
 * Approche simple et fiable : l'API game nous dit combien d'îles sont KNOWN.
 * On marque toutes les SAND qui n'ont pas encore de discoveryStatus,
 * et on fait passer en KNOWN autant de groupes que l'API en déclare.
 */
export async function syncDiscoveryFromPlayerDetails(
  knownIslandNames: string[],
): Promise<number> {
  // Marque KNOWN uniquement les cellules SAND qui n'ont PAS encore de
  // discoveryStatus (anciennes cellules d'avant la feature).
  // Les cellules explicitement "DISCOVERED" restent DISCOVERED — seul
  // validateDiscoveries() (retour sur île KNOWN) les fait passer KNOWN.
  const col = getDb().collection(COLLECTION);
  const result = await col.updateMany(
    { type: "SAND", discoveryStatus: { $exists: false } },
    { $set: { discoveryStatus: "KNOWN" } },
  );
  if (result.modifiedCount > 0) invalidateGridCache();
  return result.modifiedCount;
}

/**
 * Reset : toutes les SAND → DISCOVERED, sauf HOME (5,3) → KNOWN.
 * À exécuter une seule fois pour repartir sur une base propre.
 */
export async function resetDiscoveryStatus(): Promise<{ reset: number; home: number }> {
  const col = getDb().collection(COLLECTION);
  const resetResult = await col.updateMany(
    { type: "SAND" },
    { $set: { discoveryStatus: "DISCOVERED" } },
  );
  // Re-marquer les ALWAYS_KNOWN
  let homeCount = 0;
  for (const key of ALWAYS_KNOWN) {
    const [x, y] = key.split(",").map(Number);
    const r = await col.updateMany(
      { x, y, type: "SAND" },
      { $set: { discoveryStatus: "KNOWN" } },
    );
    homeCount += r.modifiedCount;
  }
  invalidateGridCache();
  return { reset: resetResult.modifiedCount, home: homeCount };
}

// ─── Cell queries ───────────────────────────────────────────────────

export async function setCellNote(x: number, y: number, note: CellNote): Promise<void> {
  const col = getDb().collection(COLLECTION);
  await col.updateOne({ x, y }, { $set: { note } });
  invalidateGridCache();
}

export async function getCellAt(x: number, y: number): Promise<Cell | null> {
  const col = getDb().collection(COLLECTION);
  const doc = await col.findOne({ x, y });
  if (!doc) return null;
  return {
    id: doc.id, x: doc.x, y: doc.y, type: doc.type, zone: doc.zone,
    note: doc.note, discoveryStatus: doc.discoveryStatus,
  } as Cell;
}

// ─── Map grid ───────────────────────────────────────────────────────

export interface CellNoteEntry {
  x: number;
  y: number;
  note: CellNote;
}

export interface IslandCell {
  x: number;
  y: number;
  zone: number;
  discoveryStatus: DiscoveryStatus;
}

export interface MapGrid {
  grid: string[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  notes: CellNoteEntry[];
  /** Toutes les cellules SAND */
  islands: IslandCell[];
  /** Cellules SAND où un refuel a été confirmé (seule source de vérité) */
  confirmedRefuel: { x: number; y: number }[];
}

export async function getMapGrid(): Promise<MapGrid> {
  if (_gridCache) return _gridCache;

  const col = getDb().collection(COLLECTION);
  const cells = await col.find({}).toArray();

  if (!cells.length) {
    return { grid: [], minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, notes: [], islands: [], confirmedRefuel: [] };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of cells) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  const rows: string[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "0")
  );

  for (const c of cells) {
    const row = c.y - minY;
    const col = c.x - minX;
    // 0=inconnu, 1=SEA, 2=SAND (toute île visible)
    if (c.type === "SEA") {
      rows[row][col] = "1";
    } else if (c.type === "SAND") {
      rows[row][col] = "2";
    }
  }

  const grid = rows.map((r) => r.join(""));

  const notes: CellNoteEntry[] = cells
    .filter((c) => c.note)
    .map((c) => ({ x: c.x, y: c.y, note: c.note as CellNote }));

  const islands: IslandCell[] = cells
    .filter((c) => c.type === "SAND")
    .map((c) => ({
      x: c.x, y: c.y, zone: c.zone,
      discoveryStatus: (c.discoveryStatus ?? "DISCOVERED") as DiscoveryStatus,
    }));

  const confirmedRefuel = await getConfirmedRefuelCoords();

  const result = { grid, minX, maxX, minY, maxY, width, height, notes, islands, confirmedRefuel };
  _gridCache = result;
  return result;
}
