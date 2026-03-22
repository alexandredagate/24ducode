import { type ArcRotateCamera, Color3, Color4, FresnelParameters, type InstancedMesh, Mesh, StandardMaterial, Vector3, type Engine, type Scene } from "babylonjs";
import { type GameMap, TileType, type TileCell } from "./parse-map";

function isVisible(t: string) { return t === TileType.Water || t === TileType.Island || t === TileType.Discovered; }
function isIsland(t: string) { return t === TileType.Island || t === TileType.Discovered; }
import { createWaterTiles, addWaterTile, createRoundedBoxMesh } from "./water-tile";
import { buildIslandMeshes } from "../map/IslandMeshBuilder";
import { createEmojiBillboard, computeEmojiScale } from "./emoji-billboard";
import { serverToGrid } from "../services/map-converter";
import type { MapMeta } from "../services/socket";

const TILE_SIZE = 1.0;
const GAP = 0;

export interface MapResult {
  tileMeshes: Map<string, Mesh>;
  map: GameMap;
  applyUpdate: (newMap: GameMap, confirmedSet?: Set<string>, clipCenter?: { row: number; col: number }) => void;
  dispose: () => void;
}

export function createMap(scene: Scene, engine: Engine, map: GameMap, camera: ArcRotateCamera, meta?: MapMeta | null, confirmedSet?: Set<string>, viewRadius = 8): MapResult {
  let currentMap = map;
  const STEP = TILE_SIZE + GAP;

  function getOriginX() { return -(currentMap.cols - 1) / 2; }
  function getOriginZ() { return -(currentMap.rows - 1) / 2; }

  const waterCells: TileCell[] = [];
  for (const row of map.cells) {
    for (const cell of row) {
      if (isVisible(cell.type)) {
        waterCells.push(cell);
      }
    }
  }

  const waterResult = createWaterTiles(scene, engine, waterCells, getOriginX(), getOriginZ());
  let tileMeshes = waterResult.tileMeshMap;

  const numericGrid: number[][] = map.cells.map(row =>
    row.map(cell => Number(cell.type)),
  );

  let currentConfirmedSet = confirmedSet ?? new Set<string>();
  const islandMeshes: Mesh[] = [...buildIslandMeshes(numericGrid, TILE_SIZE, GAP, scene, currentConfirmedSet)];

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
        if (cell.type === TileType.Discovered) {
          addMarker(cell.row, cell.col);
        }
      }
    }
  }

  for (const row of map.cells) {
    for (const cell of row) {
      if (cell.type === TileType.Discovered) {
        addMarker(cell.row, cell.col);
      }
    }
  }

  let homeMarker: Mesh | null = null;
  const homeGrid = meta ? serverToGrid(5, 3, meta) : null;

  function updateHomeMarkerVisibility(targetMap: GameMap) {
    if (!homeMarker || !homeGrid) return;
    const cell = targetMap.cells[homeGrid.row]?.[homeGrid.col];
    homeMarker.isVisible = cell != null && isVisible(cell.type);
  }

  if (homeGrid) {
    const hx = getOriginX() + homeGrid.col * TILE_SIZE;
    const hz = getOriginZ() + homeGrid.row * TILE_SIZE;
    homeMarker = createEmojiBillboard("\u{1F3E0}", "homeMarker", scene);
    homeMarker.position.set(hx, MARKER_Y, hz);
    updateHomeMarkerVisibility(map);
  }

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

  // Ocean floor — sized to match visible area (VIEW_RADIUS)
  const visibleDiameter = viewRadius * 2 * STEP + 2;
  const oceanFloor = createRoundedBoxMesh(
    'oceanFloor',
    visibleDiameter / 2,
    0.30,
    visibleDiameter / 2,
    0.35,
    12,
    scene,
  );
  oceanFloor.position.y = -0.35;
  // Center ocean floor on visible (non-void) cells
  {
    let sumR = 0, sumC = 0, count = 0;
    for (const row of map.cells) {
      for (const cell of row) {
        if (cell.type !== TileType.Void) { sumR += cell.row; sumC += cell.col; count++; }
      }
    }
    if (count > 0) {
      oceanFloor.position.x = getOriginX() + (sumC / count) * STEP;
      oceanFloor.position.z = getOriginZ() + (sumR / count) * STEP;
    }
  }

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

  const voidInstances: InstancedMesh[] = [];
  const voidKeys = new Set<string>();

  const voidMaster = createRoundedBoxMesh(
    'voidTileMaster',
    TILE_SIZE / 2, 0.30, TILE_SIZE / 2,
    0.35, 12, scene,
  );
  voidMaster.isVisible = false;

  const voidMat = new StandardMaterial('voidMat', scene);
  voidMat.diffuseColor = new Color3(0.04, 0.08, 0.18);
  voidMat.emissiveColor = new Color3(0.02, 0.04, 0.10);
  voidMat.specularColor = new Color3(0.3, 0.35, 0.5);
  voidMat.specularPower = 48;
  const voidFresnel = new FresnelParameters();
  voidFresnel.bias = 0.1;
  voidFresnel.power = 2.0;
  voidFresnel.leftColor = new Color3(0.15, 0.25, 0.45);
  voidFresnel.rightColor = new Color3(0, 0.02, 0.06);
  voidMat.emissiveFresnelParameters = voidFresnel;
  voidMat.backFaceCulling = false;
  voidMaster.material = voidMat;

  function isVoidAt(r: number, c: number): boolean {
    if (r < 0 || r >= currentMap.rows || c < 0 || c >= currentMap.cols) return true;
    return currentMap.cells[r][c].type === TileType.Void;
  }

  // Extend void tiles far enough so the player never sees the edge.
  // Camera maxZ=180, upperRadiusLimit=20 → at lowest angle the ground is
  // visible out to ~80 tiles. Instances are cheap (single draw call).
  const VOID_EXTENT = 45;

  function addVoidInstance(r: number, c: number) {
    const key = `${r}_${c}`;
    if (voidKeys.has(key)) return;
    voidKeys.add(key);

    const x = getOriginX() + c * STEP;
    const z = getOriginZ() + r * STEP;

    const inst = voidMaster.createInstance(`void_${key}`);
    inst.position.set(x, 0, z);
    voidInstances.push(inst);
  }

  function rebuildFog(centerR?: number, centerC?: number) {
    for (const m of voidInstances) m.dispose();
    voidInstances.length = 0;
    voidKeys.clear();

    if (centerR == null || centerC == null) {
      let sumR = 0, sumC = 0, cnt = 0;
      for (const row of currentMap.cells) {
        for (const cell of row) {
          if (cell.type !== TileType.Void) { sumR += cell.row; sumC += cell.col; cnt++; }
        }
      }
      if (cnt === 0) return;
      centerR = Math.round(sumR / cnt);
      centerC = Math.round(sumC / cnt);
    }

    const extent2 = VOID_EXTENT * VOID_EXTENT;
    for (let dr = -VOID_EXTENT; dr <= VOID_EXTENT; dr++) {
      for (let dc = -VOID_EXTENT; dc <= VOID_EXTENT; dc++) {
        if (dr * dr + dc * dc > extent2) continue;
        const r = centerR! + dr;
        const c = centerC! + dc;
        if (isVoidAt(r, c)) addVoidInstance(r, c);
      }
    }
  }

  rebuildFog();

  const knownCells = new Set<string>();
  for (const row of map.cells) {
    for (const cell of row) {
      knownCells.add(`${cell.row}_${cell.col}_${cell.type}`);
    }
  }

  function applyUpdate(newMap: GameMap, newConfirmedSet?: Set<string>, clipCenter?: { row: number; col: number }) {
    if (newConfirmedSet) currentConfirmedSet = newConfirmedSet;
    if (clipCenter) {
      oceanFloor.position.x = getOriginX() + clipCenter.col * STEP;
      oceanFloor.position.z = getOriginZ() + clipCenter.row * STEP;
    }
    const oldOriginX = getOriginX();
    const oldOriginZ = getOriginZ();
    currentMap = newMap;
    const newOriginX = getOriginX();
    const newOriginZ = getOriginZ();

    if (Math.abs(newOriginX - oldOriginX) > 0.001 || Math.abs(newOriginZ - oldOriginZ) > 0.001) {
      fullRebuild(newMap);
      return;
    }

    const newWaterCells: TileCell[] = [];
    let hasNewIslands = false;
    let hasRemovals = false;

    for (const row of newMap.cells) {
      for (const cell of row) {
        const key = `${cell.row}_${cell.col}_${cell.type}`;
        if (knownCells.has(key)) continue;

        const posKey = `${cell.row}_${cell.col}`;

        // Cell became Void → remove existing mesh
        if (cell.type === TileType.Void) {
          const existing = tileMeshes.get(posKey);
          if (existing) {
            existing.dispose();
            tileMeshes.delete(posKey);
            hasRemovals = true;
          }
          // Remove old known entry for this position
          for (const k of knownCells) {
            if (k.startsWith(posKey + '_')) { knownCells.delete(k); break; }
          }
          knownCells.add(key);
          continue;
        }

        for (const k of knownCells) {
          if (k.startsWith(posKey + '_')) { knownCells.delete(k); break; }
        }
        knownCells.add(key);

        if (isVisible(cell.type)) {
          if (!tileMeshes.has(posKey)) {
            newWaterCells.push(cell);
          }
        }

        if (isIsland(cell.type)) {
          hasNewIslands = true;
        }
      }
    }

    for (const cell of newWaterCells) {
      const mesh = addWaterTile(waterResult, cell, newOriginX, newOriginZ);
      if (mesh) {
        tileMeshes.set(`${cell.row}_${cell.col}`, mesh);
      }
    }

    if (hasNewIslands || hasRemovals) {
      for (const m of islandMeshes) m.dispose();
      islandMeshes.length = 0;

      const newNumericGrid = newMap.cells.map(row => row.map(cell => Number(cell.type)));
      const newIslands = buildIslandMeshes(newNumericGrid, TILE_SIZE, GAP, scene, currentConfirmedSet);
      islandMeshes.push(...newIslands);

      // Rebuild markers (discovered islands may have changed)
      rebuildMarkers();
    }

    updateHomeMarkerVisibility(newMap);
    rebuildFog(clipCenter?.row, clipCenter?.col);
  }

  function fullRebuild(newMap: GameMap) {
    for (const mesh of tileMeshes.values()) mesh.dispose();
    tileMeshes.clear();
    waterResult.dispose();

    for (const m of islandMeshes) m.dispose();
    islandMeshes.length = 0;

    const newWaterCells: TileCell[] = [];
    for (const row of newMap.cells) {
      for (const cell of row) {
        if (isVisible(cell.type)) {
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
    islandMeshes.push(...buildIslandMeshes(newNumericGrid, TILE_SIZE, GAP, scene, currentConfirmedSet));

    knownCells.clear();
    for (const row of newMap.cells) {
      for (const cell of row) {
        knownCells.add(`${cell.row}_${cell.col}_${cell.type}`);
      }
    }

    rebuildMarkers();
    updateHomeMarkerVisibility(newMap);
    rebuildFog();
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

    for (const m of voidInstances) m.dispose();
    voidMaster.dispose();
    voidMat.dispose();
  }

  return { tileMeshes, map, applyUpdate, dispose };
}
