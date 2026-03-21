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
  dispose: () => void;
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

  // Collect all meshes/particles created for this map so we can dispose them
  const meshNames = new Set<string>();
  for (const mesh of scene.meshes) {
    meshNames.add(mesh.name);
  }
  const particleSystems = [...scene.particleSystems];

  function dispose() {
    // Dispose water tile meshes
    for (const mesh of tileMeshes.values()) {
      mesh.dispose();
    }
    tileMeshes.clear();

    // Dispose island meshes
    const toDispose = scene.meshes.filter(m => m.name.startsWith('island_ground'));
    for (const m of toDispose) m.dispose();

    // Dispose fog plane
    const fogPlane = scene.getMeshByName('fogPlane');
    if (fogPlane) fogPlane.dispose();

    // Dispose all particle systems (fog)
    for (const ps of particleSystems) {
      ps.stop();
      ps.dispose();
    }
  }

  return { tileMeshes, map, dispose };
}
