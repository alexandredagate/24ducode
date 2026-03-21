import { Color3, MeshBuilder, StandardMaterial, type Engine, type Mesh, type Scene } from "babylonjs";
import { type GameMap, TileType, type TileCell } from "./parse-map";
import { createWaterTiles, addWaterTile } from "./water-tile";
import { buildIslandMeshes } from "../map/IslandMeshBuilder";

const TILE_SIZE = 1.0;
const GAP = 0;

export interface MapResult {
  tileMeshes: Map<string, Mesh>;
  map: GameMap;
  applyUpdate: (newMap: GameMap) => void;
  dispose: () => void;
}

export function createMap(scene: Scene, engine: Engine, map: GameMap): MapResult {
  let currentMap = map;
  const STEP = TILE_SIZE + GAP;

  function getOriginX() { return -(currentMap.cols - 1) / 2; }
  function getOriginZ() { return -(currentMap.rows - 1) / 2; }

  // ─── Première construction complète ─────────────────

  const waterCells: TileCell[] = [];
  for (const row of map.cells) {
    for (const cell of row) {
      if (cell.type === TileType.Water || cell.type === TileType.Island) {
        waterCells.push(cell);
      }
    }
  }

  const waterResult = createWaterTiles(scene, engine, waterCells, getOriginX(), getOriginZ());
  let tileMeshes = waterResult.tileMeshMap;

  const numericGrid: number[][] = map.cells.map(row =>
    row.map(cell => Number(cell.type)),
  );

  const islandMeshes: Mesh[] = [...buildIslandMeshes(numericGrid, TILE_SIZE, GAP, scene)];

  // Fog

  // Ocean floor
  const borderSize = Math.max(map.rows, map.cols) * STEP + 40;
  const oceanFloor = MeshBuilder.CreateGround('oceanFloor', {
    width: borderSize,
    height: borderSize,
    subdivisions: 1,
  }, scene);
  oceanFloor.position.y = -0.25;

  const oceanFloorMat = new StandardMaterial('oceanFloorMat', scene);
  oceanFloorMat.diffuseColor = new Color3(0.03, 0.08, 0.18);
  oceanFloorMat.emissiveColor = new Color3(0.01, 0.03, 0.06);
  oceanFloorMat.specularColor = Color3.Black();
  oceanFloor.material = oceanFloorMat;

  // Tracker les cellules connues
  const knownCells = new Set<string>();
  for (const row of map.cells) {
    for (const cell of row) {
      knownCells.add(`${cell.row}_${cell.col}_${cell.type}`);
    }
  }

  // ─── Mise à jour incrémentale ───────────────────────

  function applyUpdate(newMap: GameMap) {
    const oldOriginX = getOriginX();
    const oldOriginZ = getOriginZ();
    currentMap = newMap;
    const newOriginX = getOriginX();
    const newOriginZ = getOriginZ();

    // Si l'origine a changé (grille agrandie), il faut tout reconstruire
    if (Math.abs(newOriginX - oldOriginX) > 0.001 || Math.abs(newOriginZ - oldOriginZ) > 0.001) {
      fullRebuild(newMap);
      return;
    }

    // Diff : trouver les cellules qui ont changé
    const newWaterCells: TileCell[] = [];
    let hasNewIslands = false;

    for (const row of newMap.cells) {
      for (const cell of row) {
        const key = `${cell.row}_${cell.col}_${cell.type}`;
        if (knownCells.has(key)) continue;

        // Nouvelle cellule ou type changé
        knownCells.add(key);

        if (cell.type === TileType.Water || cell.type === TileType.Island) {
          // Vérifier si on a déjà une water tile à cette position
          if (!tileMeshes.has(`${cell.row}_${cell.col}`)) {
            newWaterCells.push(cell);
          }
        }

        if (cell.type === TileType.Island) {
          hasNewIslands = true;
        }
      }
    }

    // Ajouter les nouvelles water tiles incrémentalement
    for (const cell of newWaterCells) {
      const mesh = addWaterTile(waterResult, cell, newOriginX, newOriginZ);
      if (mesh) {
        tileMeshes.set(`${cell.row}_${cell.col}`, mesh);
      }
    }

    // Reconstruire les îles seulement si de nouvelles cellules île sont apparues
    if (hasNewIslands) {
      // Dispose les anciennes îles
      for (const m of islandMeshes) m.dispose();
      islandMeshes.length = 0;

      const newNumericGrid = newMap.cells.map(row => row.map(cell => Number(cell.type)));
      const newIslands = buildIslandMeshes(newNumericGrid, TILE_SIZE, GAP, scene);
      islandMeshes.push(...newIslands);
    }
  }

  function fullRebuild(newMap: GameMap) {
    // Dispose tout sauf l'ocean floor
    for (const mesh of tileMeshes.values()) mesh.dispose();
    tileMeshes.clear();
    waterResult.dispose();

    for (const m of islandMeshes) m.dispose();
    islandMeshes.length = 0;

    // Recréer
    const newWaterCells: TileCell[] = [];
    for (const row of newMap.cells) {
      for (const cell of row) {
        if (cell.type === TileType.Water || cell.type === TileType.Island) {
          newWaterCells.push(cell);
        }
      }
    }

    const newOriginX = getOriginX();
    const newOriginZ = getOriginZ();
    const newWaterResult = createWaterTiles(scene, engine, newWaterCells, newOriginX, newOriginZ);
    tileMeshes = newWaterResult.tileMeshMap;
    Object.assign(waterResult, newWaterResult);

    const newNumericGrid = newMap.cells.map(row => row.map(cell => Number(cell.type)));
    islandMeshes.push(...buildIslandMeshes(newNumericGrid, TILE_SIZE, GAP, scene));

    knownCells.clear();
    for (const row of newMap.cells) {
      for (const cell of row) {
        knownCells.add(`${cell.row}_${cell.col}_${cell.type}`);
      }
    }
  }

  function dispose() {
    for (const mesh of tileMeshes.values()) mesh.dispose();
    tileMeshes.clear();
    waterResult.dispose();

    for (const m of islandMeshes) m.dispose();


    oceanFloor.dispose();
  }

  return { tileMeshes, map, applyUpdate, dispose };
}
