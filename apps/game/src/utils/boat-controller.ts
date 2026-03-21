import type { Engine, Mesh, Scene, TransformNode } from "babylonjs";
import type { GameMap } from "./parse-map";
import { moveShip, type Direction, type ShipMoveResponse, type MapMeta } from "../services/socket";
import { serverToGrid, gridToServer } from "../services/map-converter";

const TILE_SIZE = 1.0;
const MOVE_SPEED = 2.5;
const ROTATION_SPEED = 8.0;
const BOAT_Y_OFFSET = 0.55;
const MODEL_ROTATION_OFFSET = 0;

const HEADINGS: Record<Direction, number> = {
  N:  Math.PI,
  S:  0,
  W:  -Math.PI / 2,
  E:  Math.PI / 2,
  NW: Math.PI * 3 / 4,
  NE: -Math.PI * 3 / 4,
  SW: -Math.PI / 4,
  SE: Math.PI / 4,
};

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp:    'N',
  ArrowDown:  'S',
  ArrowLeft:  'W',
  ArrowRight: 'E',
};

export interface BoatController {
  gridRow: number;
  gridCol: number;
  boat: TransformNode;
  energy: number;
  setPosition: (row: number, col: number, animate?: boolean) => void;
  updateMap: (newMap: GameMap, newTileMeshes: Map<string, Mesh>, newMeta: MapMeta | null) => void;
  dispose: () => void;
}

export function createBoatController(
  boat: TransformNode,
  initialTileMeshes: Map<string, Mesh>,
  initialMap: GameMap,
  startRow: number,
  startCol: number,
  engine: Engine,
  scene: Scene,
  initialMeta: MapMeta | null,
): BoatController {
  // Mutable references — updated by updateMap()
  let currentTileMeshes = initialTileMeshes;
  let mapMeta = initialMeta;
  let originX = -(initialMap.cols - 1) / 2;
  let originZ = -(initialMap.rows - 1) / 2;

  function toWorldX(col: number) { return originX + col * TILE_SIZE; }
  function toWorldZ(row: number) { return originZ + row * TILE_SIZE; }

  let gridRow = startRow;
  let gridCol = startCol;
  let worldX = toWorldX(gridCol);
  let worldZ = toWorldZ(gridRow);
  let targetX = worldX;
  let targetZ = worldZ;
  let currentHeading = HEADINGS.S + MODEL_ROTATION_OFFSET;
  let targetHeading = currentHeading;
  let pendingMove = false;
  let energy = -1;
  let time = 0;

  boat.position.x = worldX;
  boat.position.z = worldZ;
  boat.rotation.y = currentHeading;

  // ─── Keyboard ───────────────────────────────────────
  const keys = new Set<string>();

  function onKeyDown(e: KeyboardEvent) {
    if (e.key in KEY_TO_DIRECTION) {
      e.preventDefault();
      keys.add(e.key);
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    keys.delete(e.key);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // ─── Server-driven movement ─────────────────────────
  async function tryMoveServer(direction: Direction) {
    if (pendingMove) return;
    targetHeading = HEADINGS[direction] + MODEL_ROTATION_OFFSET;
    pendingMove = true;

    try {
      const result: ShipMoveResponse = await moveShip(direction);
      energy = result.energy;

      if (mapMeta) {
        const pos = serverToGrid(result.position.x, result.position.y, mapMeta);
        gridRow = pos.row;
        gridCol = pos.col;
      }

      targetX = toWorldX(gridCol);
      targetZ = toWorldZ(gridRow);
    } catch (err) {
      console.warn('[boat] move failed:', err);
    } finally {
      pendingMove = false;
    }
  }

  // ─── HUD ────────────────────────────────────────────
  const hud = document.createElement('div');
  hud.style.cssText =
    'position:fixed;top:12px;left:12px;color:#fff;font:600 13px/1.4 monospace;' +
    'background:rgba(0,0,0,0.55);padding:6px 12px;border-radius:6px;z-index:10;pointer-events:none;';
  document.body.appendChild(hud);

  // ─── Render loop ────────────────────────────────────
  const observer = scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;
    time += dt;

    // Input → server move
    for (const [key, dir] of Object.entries(KEY_TO_DIRECTION)) {
      if (keys.has(key)) {
        tryMoveServer(dir);
        break;
      }
    }

    // Smooth position animation
    const dx = targetX - worldX;
    const dz = targetZ - worldZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0.005) {
      const step = MOVE_SPEED * dt;
      if (step >= dist) {
        worldX = targetX;
        worldZ = targetZ;
      } else {
        worldX += (dx / dist) * step;
        worldZ += (dz / dist) * step;
      }
    }

    // Smooth rotation
    let headingDiff = targetHeading - currentHeading;
    while (headingDiff > Math.PI)  headingDiff -= 2 * Math.PI;
    while (headingDiff < -Math.PI) headingDiff += 2 * Math.PI;
    currentHeading += headingDiff * Math.min(1, ROTATION_SPEED * dt);

    // Wave following
    const tileRow = Math.round((worldZ - originZ) / TILE_SIZE);
    const tileCol = Math.round((worldX - originX) / TILE_SIZE);
    const tile = currentTileMeshes.get(`${tileRow}_${tileCol}`);

    const waveY    = tile ? tile.position.y : 0;
    const waveRotX = tile ? tile.rotation.x : 0;
    const waveRotZ = tile ? tile.rotation.z : 0;

    const tangageX = Math.sin(time * 1.1) * 0.025 + Math.sin(time * 2.3 + 1.0) * 0.012;
    const tangageZ = Math.sin(time * 0.9 + 0.5) * 0.02 + Math.sin(time * 1.8 + 2.0) * 0.008;

    boat.position.x = worldX;
    boat.position.z = worldZ;
    boat.position.y = waveY + BOAT_Y_OFFSET;
    boat.rotation.y = currentHeading;
    boat.rotation.x = waveRotX + tangageX;
    boat.rotation.z = waveRotZ + tangageZ;

    // HUD — show server coordinates (x, y)
    const energyStr = energy >= 0 ? ` | energy: ${energy}` : '';
    if (mapMeta) {
      const server = gridToServer(gridRow, gridCol, mapMeta);
      hud.textContent = `x:${server.x} y:${server.y}${energyStr}`;
    } else {
      hud.textContent = `(${gridCol}, ${gridRow})${energyStr}`;
    }
  });

  return {
    get gridRow() { return gridRow; },
    get gridCol() { return gridCol; },
    get energy() { return energy; },
    boat,

    setPosition(row: number, col: number, animate = true) {
      const newTargetX = toWorldX(col);
      const newTargetZ = toWorldZ(row);

      if (animate) {
        const ddx = newTargetX - worldX;
        const ddz = newTargetZ - worldZ;
        if (Math.abs(ddx) > 0.001 || Math.abs(ddz) > 0.001) {
          targetHeading = Math.atan2(ddx, ddz) + MODEL_ROTATION_OFFSET;
        }
      }

      gridRow = row;
      gridCol = col;
      targetX = newTargetX;
      targetZ = newTargetZ;

      if (!animate) {
        worldX = targetX;
        worldZ = targetZ;
        boat.position.x = worldX;
        boat.position.z = worldZ;
      }
    },

    updateMap(newMap: GameMap, newTileMeshes: Map<string, Mesh>, newMeta: MapMeta | null) {
      currentTileMeshes = newTileMeshes;
      mapMeta = newMeta;
      originX = -(newMap.cols - 1) / 2;
      originZ = -(newMap.rows - 1) / 2;

      // Recalculate grid position from server coords, then snap world position
      if (newMeta) {
        const server = gridToServer(gridRow, gridCol, mapMeta!);
        // mapMeta may have shifted — recalculate grid in new coordinate space
        const pos = serverToGrid(server.x, server.y, newMeta);
        gridRow = pos.row;
        gridCol = pos.col;
      }

      // Snap to new world position (map origin may have shifted)
      worldX = toWorldX(gridCol);
      worldZ = toWorldZ(gridRow);
      targetX = worldX;
      targetZ = worldZ;
      boat.position.x = worldX;
      boat.position.z = worldZ;
    },

    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      hud.remove();
    },
  };
}
