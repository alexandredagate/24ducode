import type { GameMap, TileCell } from '../utils/parse-map';
import { TileType } from '../utils/parse-map';
import type { MapGridData } from './socket';

/**
 * Converts server grid format to the game's GameMap.
 *
 * Server format:  '0' = sea,  '1' = land,  ' ' = unknown
 * Game format:    '0' = void, '1' = water, '2' = island
 */
export function serverGridToGameMap(data: MapGridData): GameMap {
  const rows = data.grid.length;
  const cols = data.width;

  const cells: TileCell[][] = data.grid.map((line, row) => {
    const rowCells: TileCell[] = [];
    for (let col = 0; col < cols; col++) {
      const ch = col < line.length ? line[col] : ' ';
      let type: TileType;
      switch (ch) {
        case '0': type = TileType.Water; break;   // sea → water
        case '1': type = TileType.Island; break;   // land → island
        default:  type = TileType.Void; break;     // unknown → void
      }
      rowCells.push({ type, row, col });
    }
    return rowCells;
  });

  return { rows, cols, cells };
}
