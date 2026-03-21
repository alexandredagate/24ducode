import type { Engine, Mesh, Scene } from "babylonjs";
import { type GameMap, TileType, type TileCell } from "./parse-map";
import { createWaterTiles } from "./water-tile";
import { buildIslandMeshes } from "../map/IslandMeshBuilder";
import { createFogOfWar } from "./fog-of-war";

const TILE_SIZE = 1.0;
const GAP = 0;

export interface MapResult {
  tileMeshes: Map<string, Mesh>;
  map: GameMap;
}

export function createMap(scene: Scene, engine: Engine, map: GameMap): MapResult {
  const originX = -(map.cols - 1) / 2;
  const originZ = -(map.rows - 1) / 2;

  const cellsByType = new Map<string, TileCell[]>();

  for (const row of map.cells) {
    for (const cell of row) {
      const list = cellsByType.get(cell.type) ?? [];
      list.push(cell);
      cellsByType.set(cell.type, list);
    }
  }

  let tileMeshes = new Map<string, Mesh>();

  if (cellsByType.get(TileType.Water)) {
    tileMeshes = createWaterTiles(scene, engine, cellsByType.get(TileType.Water)!, originX, originZ);
  }

  const numericGrid: number[][] = map.cells.map(row =>
    row.map(cell => Number(cell.type)),
  );

  buildIslandMeshes(numericGrid, TILE_SIZE, GAP, scene);

  createFogOfWar(scene, engine, map);

  return { tileMeshes, map };
}
