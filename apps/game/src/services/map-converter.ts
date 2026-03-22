import type { GameMap, TileCell, TileType } from '../utils/parse-map';
import type { MapGridData } from './socket';
export type { MapMeta } from './socket';

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

export function serverToGrid(x: number, y: number, meta: MapMeta) {
  return { row: meta.maxY - y, col: x - meta.minX };
}

export function gridToServer(row: number, col: number, meta: MapMeta) {
  return { x: col + meta.minX, y: meta.maxY - row };
}

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
