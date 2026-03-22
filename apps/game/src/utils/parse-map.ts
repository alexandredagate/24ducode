export const TileType = {
  Void: '0',
  Water: '1',
  Island: '2',
  Discovered: '3',
} as const;

export type TileType = (typeof TileType)[keyof typeof TileType];

export interface TileCell {
  type: TileType;
  row: number;
  col: number;
}

export interface GameMap {
  rows: number;
  cols: number;
  cells: TileCell[][];
}

export function clipMapToCircle(map: GameMap, centerRow: number, centerCol: number, radius: number): GameMap {
  const r2 = radius * radius;
  const cells = map.cells.map((row, r) =>
    row.map((cell, c) => {
      const dr = r - centerRow;
      const dc = c - centerCol;
      if (dr * dr + dc * dc <= r2) return cell;
      return { ...cell, type: TileType.Void as TileType };
    }),
  );
  return { rows: map.rows, cols: map.cols, cells };
}

export function parseMap(raw: string): GameMap {
  const lines = raw.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const rows = lines.length;
  const cols = Math.max(...lines.map(l => l.length));

  const cells: TileCell[][] = lines.map((line, row) =>
    Array.from(line).map((char, col) => ({
      type: char as TileType,
      row,
      col,
    })),
  );

  return { rows, cols, cells };
}
