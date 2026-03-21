export const TileType = {
  Void: '0',
  Water: '1',
  Island: '2',
  /** Île vue mais pas encore validée (DISCOVERED) */
  IslandDiscovered: '3',
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
