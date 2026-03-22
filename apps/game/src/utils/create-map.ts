import { type ArcRotateCamera, Color3, FresnelParameters, Mesh, StandardMaterial, type Engine, type Scene } from "babylonjs";
import { type GameMap, TileType, type TileCell } from "./parse-map";
import { createWaterTiles, addWaterTile, createRoundedBoxMesh } from "./water-tile";
import { buildIslandMeshes } from "../map/IslandMeshBuilder";
import { createEmojiBillboard, computeEmojiScale } from "./emoji-billboard";
import { serverToGrid, type MapMeta } from "../services/map-converter";

const TILE_SIZE = 1.0;
const GAP = 0;

export interface MapResult {
  tileMeshes: Map<string, Mesh>;
  map: GameMap;
  applyUpdate: (newMap: GameMap) => void;
  dispose: () => void;
}

export function createMap(scene: Scene, engine: Engine, map: GameMap, camera: ArcRotateCamera, meta?: MapMeta | null): MapResult {
  let currentMap = map;
  const STEP = TILE_SIZE + GAP;

  function getOriginX() { return -(currentMap.cols - 1) / 2; }
  function getOriginZ() { return -(currentMap.rows - 1) / 2; }

  // ─── Première construction complète ─────────────────

  const waterCells: TileCell[] = [];
  for (const row of map.cells) {
    for (const cell of row) {
      if (cell.type === TileType.Water || cell.type === TileType.Island || cell.type === TileType.IslandDiscovered) {
        waterCells.push(cell);
      }
    }
  }

  const waterResult = createWaterTiles(scene, engine, waterCells, getOriginX(), getOriginZ());
  let tileMeshes = waterResult.tileMeshMap;

  // Pour le mesh builder, on traite 2 (KNOWN) et 3 (DISCOVERED) comme des îles
  const numericGrid: number[][] = map.cells.map(row =>
    row.map(cell => {
      const n = Number(cell.type);
      // Garder 2 et 3 séparés pour que le mesh builder puisse les différencier
      return n;
    }),
  );

  const islandMeshes: Mesh[] = [...buildIslandMeshes(numericGrid, TILE_SIZE, GAP, scene)];

  // ─── Discovered island markers (⁉️) ───────────────────
  const MARKER_Y = 1.8;
  const MARKER_BOB_SPEED = 1.5;
  const MARKER_BOB_AMP = 0.15;

  interface DiscoveredMarker { mesh: Mesh; phase: number; baseY: number; }
  const markers: DiscoveredMarker[] = [];
  const markerKeys = new Set<string>();

  function addMarker(row: number, col: number) {
    const key = `${row}_${col}`;
    if (markerKeys.has(key)) return;
    markerKeys.add(key);

    const x = getOriginX() + col * TILE_SIZE;
    const z = getOriginZ() + row * TILE_SIZE;

    const mesh = createEmojiBillboard("⁉️", `marker_${key}`, scene);
    mesh.position.set(x, MARKER_Y, z);

    markers.push({
      mesh,
      baseY: MARKER_Y,
      phase: (row * 7.3 + col * 13.1) % (Math.PI * 2),
    });
  }

  function rebuildMarkers() {
    for (const m of markers) m.mesh.dispose();
    markers.length = 0;
    markerKeys.clear();

    for (const row of currentMap.cells) {
      for (const cell of row) {
        if (cell.type === TileType.IslandDiscovered) {
          addMarker(cell.row, cell.col);
        }
      }
    }
  }

  // Initial markers
  for (const row of map.cells) {
    for (const cell of row) {
      if (cell.type === TileType.IslandDiscovered) {
        addMarker(cell.row, cell.col);
      }
    }
  }

  // ─── Home marker (🏠) at server coords (5, 3) ─────────
  let homeMarker: Mesh | null = null;
  if (meta) {
    const home = serverToGrid(5, 3, meta);
    const hx = getOriginX() + home.col * TILE_SIZE;
    const hz = getOriginZ() + home.row * TILE_SIZE;
    homeMarker = createEmojiBillboard("\u{1F3E0}", "homeMarker", scene);
    homeMarker.position.set(hx, MARKER_Y, hz);
  }

  // Animate markers + scale with camera distance
  let markerTime = 0;
  const markerObserver = scene.onBeforeRenderObservable.add(() => {
    markerTime += engine.getDeltaTime() / 1000;
    const scale = computeEmojiScale(camera.radius);
    for (const m of markers) {
      m.mesh.position.y = m.baseY + Math.sin(markerTime * MARKER_BOB_SPEED + m.phase) * MARKER_BOB_AMP;
      m.mesh.scaling.setAll(scale);
    }
    if (homeMarker) {
      homeMarker.position.y = MARKER_Y + Math.sin(markerTime * MARKER_BOB_SPEED) * MARKER_BOB_AMP;
      homeMarker.scaling.setAll(scale);
    }
  });

  // Fog

  // Ocean floor — rounded box matching tile aesthetic
  const borderSize = Math.max(map.rows, map.cols) * STEP + 40;
  const oceanFloor = createRoundedBoxMesh(
    'oceanFloor',
    borderSize / 2,
    0.30,
    borderSize / 2,
    0.35,
    12,
    scene,
  );
  oceanFloor.position.y = -0.35;

  const oceanFloorMat = new StandardMaterial('oceanFloorMat', scene);
  oceanFloorMat.diffuseColor = new Color3(0.06, 0.25, 0.50);
  oceanFloorMat.emissiveColor = new Color3(0.01, 0.05, 0.12);
  oceanFloorMat.specularColor = new Color3(0.3, 0.35, 0.4);
  oceanFloorMat.specularPower = 48;
  const fresnelParams = new FresnelParameters();
  fresnelParams.bias = 0.1;
  fresnelParams.power = 2.0;
  fresnelParams.leftColor = new Color3(0.4, 0.65, 0.9);
  fresnelParams.rightColor = new Color3(0, 0, 0);
  oceanFloorMat.emissiveFresnelParameters = fresnelParams;
  oceanFloorMat.backFaceCulling = false;
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

        if (cell.type === TileType.Water || cell.type === TileType.Island || cell.type === TileType.IslandDiscovered) {
          if (!tileMeshes.has(`${cell.row}_${cell.col}`)) {
            newWaterCells.push(cell);
          }
        }

        if (cell.type === TileType.Island || cell.type === TileType.IslandDiscovered) {
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

      // Rebuild markers (discovered islands may have changed)
      rebuildMarkers();
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
        if (cell.type === TileType.Water || cell.type === TileType.Island || cell.type === TileType.IslandDiscovered) {
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

    rebuildMarkers();
  }

  function dispose() {
    for (const mesh of tileMeshes.values()) mesh.dispose();
    tileMeshes.clear();
    waterResult.dispose();

    for (const m of islandMeshes) m.dispose();

    for (const m of markers) m.mesh.dispose();
    if (homeMarker) homeMarker.dispose();
    scene.onBeforeRenderObservable.remove(markerObserver);

    oceanFloor.dispose();
  }

  return { tileMeshes, map, applyUpdate, dispose };
}
