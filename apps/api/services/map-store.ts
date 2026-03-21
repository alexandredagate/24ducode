import { getDb } from "./db";
import type { Cell, CellNote } from "types";

const COLLECTION = "cells";
const SHIP_POSITION_COLLECTION = "ship_position";

/** Known special locations: coordinate key "x,y" → note */
const KNOWN_NOTES = new Map<string, CellNote>([
  ["5,3", "HOME"],
]);

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

export async function upsertCells(cells: Cell[]): Promise<void> {
  if (!cells.length) return;
  const col = getDb().collection(COLLECTION);
  const ops = cells.map((cell) => {
    const $set: Record<string, unknown> = { id: cell.id, x: cell.x, y: cell.y, type: cell.type, zone: cell.zone };
    const note = cell.note ?? KNOWN_NOTES.get(`${cell.x},${cell.y}`);
    if (note) $set.note = note;
    return {
      updateOne: {
        filter: { x: cell.x, y: cell.y },
        update: { $set },
        upsert: true,
      },
    };
  });
  await col.bulkWrite(ops);
}

export async function setCellNote(x: number, y: number, note: CellNote): Promise<void> {
  const col = getDb().collection(COLLECTION);
  await col.updateOne({ x, y }, { $set: { note } });
}

export async function getCellAt(x: number, y: number): Promise<Cell | null> {
  const col = getDb().collection(COLLECTION);
  const doc = await col.findOne({ x, y });
  if (!doc) return null;
  return { id: doc.id, x: doc.x, y: doc.y, type: doc.type, zone: doc.zone, note: doc.note } as Cell;
}

export interface CellNoteEntry {
  x: number;
  y: number;
  note: CellNote;
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
}

export async function getMapGrid(): Promise<MapGrid> {
  const col = getDb().collection(COLLECTION);
  const cells = await col.find({}).toArray();

  if (!cells.length) {
    return { grid: [], minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, notes: [] };
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

  // Build grid filled with 0 (unknown)
  const rows: string[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "0")
  );

  for (const c of cells) {
    const row = c.y - minY;
    const col = c.x - minX;
    rows[row][col] = c.type === "SEA" ? "1" : "2";
  }

  const grid = rows.map((r) => r.join(""));

  const notes: CellNoteEntry[] = cells
    .filter((c) => c.note)
    .map((c) => ({ x: c.x, y: c.y, note: c.note as CellNote }));

  return { grid, minX, maxX, minY, maxY, width, height, notes };
}
