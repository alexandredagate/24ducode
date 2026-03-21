import { getDb } from "./db";
import type { Cell } from "types";

const COLLECTION = "cells";

export async function upsertCells(cells: Cell[]): Promise<void> {
  if (!cells.length) return;
  const col = getDb().collection(COLLECTION);
  const ops = cells.map((cell) => ({
    updateOne: {
      filter: { id: cell.id },
      update: { $set: { id: cell.id, x: cell.x, y: cell.y, type: cell.type, zone: cell.zone } },
      upsert: true,
    },
  }));
  await col.bulkWrite(ops);
}

export interface MapGrid {
  grid: string[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export async function getMapGrid(): Promise<MapGrid> {
  const col = getDb().collection(COLLECTION);
  const cells = await col.find({}).toArray();

  if (!cells.length) {
    return { grid: [], minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
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

  return { grid, minX, maxX, minY, maxY, width, height };
}
