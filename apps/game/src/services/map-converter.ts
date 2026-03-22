import type { GameMap, TileCell, TileType } from '../utils/parse-map';
import type { MapGridData, MapMeta } from './socket';

/**
 * Converts the server grid to a GameMap.
 *
 * Server grid (map-store.ts):
 *   grid[0]        = y = minY (south)
 *   grid[height-1] = y = maxY (north)
 *   "0" = unknown, "1" = SEA, "2" = SAND KNOWN, "3" = SAND DISCOVERED
 *
 * Game rendering:
 *   row 0 → z = originZ (most negative Z = north on screen)
 *   So row 0 must be maxY (north).
 *
 * We reverse the grid rows so the visual orientation matches.
 */
export function serverGridToGameMap(data: MapGridData): GameMap {
  const cols = data.width;

  // Reverse: server grid[0]=south → game row[0]=north
  const reversedGrid = [...data.grid].reverse();
  const rows = reversedGrid.length;

  const cells: TileCell[][] = reversedGrid.map((line, row) => {
    const rowCells: TileCell[] = [];
    for (let col = 0; col < cols; col++) {
      const ch = col < line.length ? line[col] : '0';
      rowCells.push({ type: ch as TileType, row, col });
    }
    return rowCells;
  });

  return { rows, cols, cells };
}

// ─── Coordinate conversion ───────────────────────────────
// Game row 0 = maxY (north), row increases southward
// row = maxY - y,  col = x - minX

export function serverToGrid(x: number, y: number, meta: MapMeta) {
  return { row: meta.maxY - y, col: x - meta.minX };
}

export function gridToServer(row: number, col: number, meta: MapMeta) {
  return { x: col + meta.minX, y: meta.maxY - row };
}

/**
 * Convertit les coordonnées serveur confirmedRefuel en un Set de "row_col" pour le renderer.
 */
export function buildConfirmedSet(
  confirmedRefuel: { x: number; y: number }[] | undefined,
  meta: MapMeta,
): Set<string> {
  const set = new Set<string>();
  if (!confirmedRefuel) return set;
  for (const { x, y } of confirmedRefuel) {
    const { row, col } = serverToGrid(x, y, meta);
    set.add(`${row}_${col}`);
  }
  return set;
}
