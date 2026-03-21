import type { Engine, Mesh, Scene, TransformNode } from "babylonjs";
import { TileType, type GameMap } from "./parse-map";

const TILE_SIZE = 1.0;
const MOVE_SPEED = 2.5;        // tiles par seconde
const ROTATION_SPEED = 8.0;    // vitesse de rotation (lerp)
const BOAT_Y_OFFSET = 0.55;    // hauteur au-dessus de la tile

// Ajuster si le modèle ne fait pas face à la bonne direction par défaut
const MODEL_ROTATION_OFFSET = 0;

// Heading par direction (rotation.y dans BabylonJS left-hand)
// rotation.y = 0 → face +Z
const HEADINGS: Record<string, number> = {
  up:    Math.PI,       // face -Z
  down:  0,             // face +Z
  left:  -Math.PI / 2,  // face -X
  right: Math.PI / 2,   // face +X
};

export interface BoatController {
  gridRow: number;
  gridCol: number;
  boat: TransformNode;
  dispose: () => void;
}

export function createBoatController(
  boat: TransformNode,
  tileMeshes: Map<string, Mesh>,
  map: GameMap,
  startRow: number,
  startCol: number,
  engine: Engine,
  scene: Scene,
): BoatController {
  const originX = -(map.cols - 1) / 2;
  const originZ = -(map.rows - 1) / 2;

  function toWorldX(col: number) { return originX + col * TILE_SIZE; }
  function toWorldZ(row: number) { return originZ + row * TILE_SIZE; }

  // État
  let gridRow = startRow;
  let gridCol = startCol;
  let worldX = toWorldX(gridCol);
  let worldZ = toWorldZ(gridRow);
  let targetX = worldX;
  let targetZ = worldZ;
  let currentHeading = HEADINGS.down + MODEL_ROTATION_OFFSET;
  let targetHeading = currentHeading;
  let isMoving = false;
  let time = 0;

  // Position initiale
  boat.position.x = worldX;
  boat.position.z = worldZ;
  boat.rotation.y = currentHeading;

  // ─── Keyboard ───────────────────────────────────────
  const keys = new Set<string>();

  function onKeyDown(e: KeyboardEvent) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      keys.add(e.key);
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    keys.delete(e.key);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // ─── Movement ───────────────────────────────────────
  function tryMove(dRow: number, dCol: number, dir: string) {
    // Toujours tourner le bateau vers la direction pressée
    targetHeading = HEADINGS[dir] + MODEL_ROTATION_OFFSET;

    if (isMoving) return;

    const newRow = gridRow + dRow;
    const newCol = gridCol + dCol;

    // Bornes de la grille
    if (newRow < 0 || newRow >= map.rows || newCol < 0 || newCol >= map.cols) return;

    // Seulement les cases eau
    const cell = map.cells[newRow]?.[newCol];
    if (!cell || cell.type !== TileType.Water) return;

    gridRow = newRow;
    gridCol = newCol;
    targetX = toWorldX(newCol);
    targetZ = toWorldZ(newRow);
    isMoving = true;
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

    // Input
    if (keys.has('ArrowUp'))    tryMove(-1,  0, 'up');
    if (keys.has('ArrowDown'))  tryMove( 1,  0, 'down');
    if (keys.has('ArrowLeft'))  tryMove( 0, -1, 'left');
    if (keys.has('ArrowRight')) tryMove( 0,  1, 'right');

    // Déplacement fluide
    const dx = targetX - worldX;
    const dz = targetZ - worldZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0.005) {
      const step = MOVE_SPEED * dt;
      if (step >= dist) {
        worldX = targetX;
        worldZ = targetZ;
        isMoving = false;
      } else {
        worldX += (dx / dist) * step;
        worldZ += (dz / dist) * step;
      }
    } else {
      isMoving = false;
    }

    // Rotation fluide (shortest path)
    let headingDiff = targetHeading - currentHeading;
    while (headingDiff > Math.PI)  headingDiff -= 2 * Math.PI;
    while (headingDiff < -Math.PI) headingDiff += 2 * Math.PI;
    currentHeading += headingDiff * Math.min(1, ROTATION_SPEED * dt);

    // Tile sous le bateau (pour suivre la vague)
    const tileRow = Math.round((worldZ - originZ) / TILE_SIZE);
    const tileCol = Math.round((worldX - originX) / TILE_SIZE);
    const tile = tileMeshes.get(`${tileRow}_${tileCol}`);

    const waveY    = tile ? tile.position.y : 0;
    const waveRotX = tile ? tile.rotation.x : 0;
    const waveRotZ = tile ? tile.rotation.z : 0;

    // Tangage léger propre au bateau
    const tangageX = Math.sin(time * 1.1) * 0.025 + Math.sin(time * 2.3 + 1.0) * 0.012;
    const tangageZ = Math.sin(time * 0.9 + 0.5) * 0.02 + Math.sin(time * 1.8 + 2.0) * 0.008;

    // Appliquer
    boat.position.x = worldX;
    boat.position.z = worldZ;
    boat.position.y = waveY + BOAT_Y_OFFSET;

    boat.rotation.y = currentHeading;
    boat.rotation.x = waveRotX + tangageX;
    boat.rotation.z = waveRotZ + tangageZ;

    // HUD
    hud.textContent = `⚓ (${gridCol}, ${gridRow})`;
  });

  return {
    get gridRow() { return gridRow; },
    get gridCol() { return gridCol; },
    boat,
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      hud.remove();
    },
  };
}
