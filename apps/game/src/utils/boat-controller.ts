import type { ArcRotateCamera, Engine, Mesh, Scene, TransformNode } from "babylonjs";
import { StandardMaterial } from "babylonjs";
import type { GameMap } from "./parse-map";
import { moveShip, getPlayerDetails, type Direction, type ShipMoveResponse, type MapMeta } from "../services/socket";
import { serverToGrid, gridToServer } from "../services/map-converter";
import { createEmojiBillboard, computeEmojiScale } from "./emoji-billboard";

const TILE_SIZE = 1.0;
const MOVE_SPEED = 2.5;

const ROMAN_NUMERALS: [number, string][] = [
  [1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],
  [100,'C'],[90,'XC'],[50,'L'],[40,'XL'],
  [10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I'],
];
function toRoman(n: number): string {
  let result = '';
  for (const [value, numeral] of ROMAN_NUMERALS) {
    while (n >= value) { result += numeral; n -= value; }
  }
  return result;
}
const ROTATION_SPEED = 8.0;
const BOAT_Y_OFFSET = 0.38;
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
  zone: number;
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
  camera: ArcRotateCamera,
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
  let prevEnergy = -1;
  let currentZone = -1;
  let time = 0;

  // Economy state
  let money = -1;
  let resources: { type: string; quantity: number }[] = [];
  let economyInterval: ReturnType<typeof setInterval> | null = null;

  async function fetchPlayerEconomy() {
    try {
      const details = await getPlayerDetails();
      money = details.money;
      resources = details.resources;
    } catch (err) {
      console.warn('[boat] failed to fetch player details:', err);
    }
  }

  // Death emoji state
  const DEATH_EMOJI_DURATION = 5;
  const DEATH_EMOJI_Y_OFFSET = 1.2;
  let deathEmoji: Mesh | null = null;
  let deathEmojiTimer = 0;

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
      if (result.position.zone != null) currentZone = result.position.zone;

      if (mapMeta) {
        const pos = serverToGrid(result.position.x, result.position.y, mapMeta);
        gridRow = pos.row;
        gridCol = pos.col;
      }

      targetX = toWorldX(gridCol);
      targetZ = toWorldZ(gridRow);
      fetchPlayerEconomy();
    } catch (err) {
      console.warn('[boat] move failed:', err);
    } finally {
      pendingMove = false;
    }
  }

  // ─── HUD ────────────────────────────────────────────
  let energyMax = 30;
  const UI = 'kenney_ui-pack-space-expansion/PNG';

  const hud = document.createElement('div');
  hud.style.cssText =
    'position:fixed;top:12px;left:12px;z-index:10;pointer-events:none;display:flex;flex-direction:column;gap:6px;';

  // Energy gauge (Double = 2x res for crisp rendering)
  const gaugeWrap = document.createElement('div');
  gaugeWrap.style.cssText = 'position:relative;width:180px;height:28px;';

  const gaugeBg = document.createElement('img');
  gaugeBg.src = `${UI}/Grey/Double/bar_round_gloss_large.png`;
  gaugeBg.draggable = false;
  gaugeBg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';

  const gaugeFill = document.createElement('img');
  gaugeFill.src = `${UI}/Red/Double/bar_round_gloss_large.png`;
  gaugeFill.draggable = false;
  gaugeFill.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;clip-path:inset(0 100% 0 0);';

  const gaugeText = document.createElement('span');
  gaugeText.style.cssText =
    'position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;' +
    'color:#fff;font:700 11px/1 monospace;text-shadow:0 1px 2px rgba(0,0,0,0.8);letter-spacing:0.5px;';

  gaugeWrap.append(gaugeBg, gaugeFill, gaugeText);

  // Helper: metal panel with text centered in the bottom body area (~60% bottom of the image)
  // The panel image has a dark header (top ~40%) and a light body (bottom ~60%)
  const PANEL_SRC = `${UI}/Grey/Double/button_square_header_small_rectangle_screws.png`;
  function createMetalPanel(): { el: HTMLDivElement; label: HTMLSpanElement } {
    const el = document.createElement('div');
    el.style.cssText = 'position:relative;width:180px;height:64px;';

    const bg = document.createElement('img');
    bg.src = PANEL_SRC;
    bg.draggable = false;
    bg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';

    // Text sits in the bottom 60% of the panel, centered
    const label = document.createElement('span');
    label.style.cssText =
      'position:absolute;left:0;width:100%;top:30%;height:60%;' +
      'display:flex;align-items:center;justify-content:center;' +
      'color:#2a2a3a;font:700 14px/1 monospace;';

    el.append(bg, label);
    return { el, label };
  }

  const zonePanel = createMetalPanel();
  const posPanel = createMetalPanel();

  hud.append(gaugeWrap, zonePanel.el, posPanel.el);
  document.body.appendChild(hud);

  // ─── HUD top-right: economy panels in a row ───────
  const hudRight = document.createElement('div');
  hudRight.style.cssText =
    'position:fixed;top:12px;right:12px;z-index:10;pointer-events:none;display:flex;flex-direction:row;gap:6px;';

  const moneyPanel = createMetalPanel();
  const ferPanel = createMetalPanel();
  const boiPanel = createMetalPanel();
  const chaPanel = createMetalPanel();

  hudRight.append(moneyPanel.el, ferPanel.el, boiPanel.el, chaPanel.el);
  document.body.appendChild(hudRight);

  // Start economy polling
  fetchPlayerEconomy();
  economyInterval = setInterval(fetchPlayerEconomy, 10_000);

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

    // HUD — energy gauge + info panel
    if (energy >= 0) {
      if (energy > energyMax) energyMax = energy;
      const pct = Math.max(0, Math.min(energyMax, energy)) / energyMax;
      gaugeFill.style.clipPath = `inset(0 ${(1 - pct) * 100}% 0 0)`;
      gaugeText.textContent = `Energy ${energy} / ${energyMax}`;
    } else {
      gaugeText.textContent = '';
    }
    zonePanel.label.textContent = currentZone >= 0 ? `Zone ${toRoman(currentZone)}` : 'Zone —';
    if (mapMeta) {
      const server = gridToServer(gridRow, gridCol, mapMeta);
      posPanel.label.textContent = `x: ${server.x}  y: ${server.y}`;
    } else {
      posPanel.label.textContent = `${gridCol}, ${gridRow}`;
    }

    // HUD — economy panels (top-right)
    moneyPanel.label.textContent = money >= 0 ? `$ ${money}` : '$ --';
    const fer = resources.find(r => r.type === 'FERONIUM')?.quantity ?? 0;
    const boi = resources.find(r => r.type === 'BOISIUM')?.quantity ?? 0;
    const cha = resources.find(r => r.type === 'CHARBONIUM')?.quantity ?? 0;
    ferPanel.label.textContent = `FER ${fer}`;
    boiPanel.label.textContent = `BOI ${boi}`;
    chaPanel.label.textContent = `CHA ${cha}`;

    // Death emoji — show ☠️ for 5s when energy drops to 0
    if (energy === 0 && prevEnergy > 0 && !deathEmoji) {
      deathEmoji = createEmojiBillboard("☠️", "deathEmoji", scene, 1.2);
      deathEmojiTimer = DEATH_EMOJI_DURATION;
    }
    prevEnergy = energy;

    if (deathEmoji) {
      deathEmojiTimer -= dt;
      deathEmoji.position.x = boat.position.x;
      deathEmoji.position.z = boat.position.z;
      deathEmoji.position.y = boat.position.y + DEATH_EMOJI_Y_OFFSET;

      const s = computeEmojiScale(camera.radius, 1.2);
      deathEmoji.scaling.setAll(s);

      // Fade out in last second
      if (deathEmojiTimer <= 1) {
        (deathEmoji.material as StandardMaterial).alpha = Math.max(0, deathEmojiTimer);
      }

      if (deathEmojiTimer <= 0) {
        deathEmoji.dispose();
        deathEmoji = null;
      }
    }
  });

  return {
    get gridRow() { return gridRow; },
    get gridCol() { return gridCol; },
    get energy() { return energy; },
    set energy(v: number) { energy = v; },
    get zone() { return currentZone; },
    set zone(v: number) { currentZone = v; },
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
      // Sauvegarder la position world actuelle avant de changer l'origine
      const prevWX = worldX;
      const prevWZ = worldZ;

      currentTileMeshes = newTileMeshes;
      mapMeta = newMeta;
      originX = -(newMap.cols - 1) / 2;
      originZ = -(newMap.rows - 1) / 2;

      // Recalculer la position grille dans le nouveau système de coordonnées
      if (newMeta) {
        const server = gridToServer(gridRow, gridCol, mapMeta!);
        const pos = serverToGrid(server.x, server.y, newMeta);
        gridRow = pos.row;
        gridCol = pos.col;
      }

      // Calculer la nouvelle position world cible
      const newTargetX = toWorldX(gridCol);
      const newTargetZ = toWorldZ(gridRow);

      // Calculer le décalage d'origine (la grille a peut-être bougé)
      const shiftX = newTargetX - prevWX;
      const shiftZ = newTargetZ - prevWZ;

      // Si le décalage est petit (même position logique, juste un recentrage de grille),
      // ajuster worldX/Z pour que le bateau ne saute pas
      if (Math.abs(shiftX) < 3 && Math.abs(shiftZ) < 3) {
        // Animer vers la nouvelle position
        targetX = newTargetX;
        targetZ = newTargetZ;
      } else {
        // Trop loin — snap immédiat (téléportation)
        worldX = newTargetX;
        worldZ = newTargetZ;
        targetX = newTargetX;
        targetZ = newTargetZ;
        boat.position.x = worldX;
        boat.position.z = worldZ;
      }
    },

    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      hud.remove();
      hudRight.remove();
      if (economyInterval) clearInterval(economyInterval);
      if (deathEmoji) { deathEmoji.dispose(); deathEmoji = null; }
    },
  };
}
