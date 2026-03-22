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

const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

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
  let economyReady = false;
  let prevMoney = 0;
  let prevFer = 0;
  let prevBoi = 0;
  let prevCha = 0;

  async function fetchPlayerEconomy() {
    try {
      const details = await getPlayerDetails();
      money = details.money;
      resources = details.resources;
    } catch (err) {
      console.warn('[boat] failed to fetch player details:', err);
    }
  }

  function showDelta(panelEl: HTMLDivElement, delta: number, gainClass = 'hud-delta--gain'): void {
    if (delta === 0) return;
    const el = document.createElement('div');
    el.className = delta > 0 ? `hud-delta ${gainClass}` : 'hud-delta hud-delta--loss';
    el.textContent = delta > 0 ? `+${delta}` : `${delta}`;
    panelEl.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
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
    if (ARROW_KEYS.has(e.key)) {
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

  const hud = document.createElement('div');
  hud.style.cssText =
    'position:fixed;top:14px;left:14px;z-index:10;pointer-events:none;display:flex;flex-direction:column;gap:8px;';

  // Energy gauge
  const gaugeWrap = document.createElement('div');
  gaugeWrap.className = 'hud-gauge';

  const gaugeLabel = document.createElement('span');
  gaugeLabel.className = 'hud-gauge-label';
  gaugeLabel.textContent = 'Énergie';

  const gaugeTrack = document.createElement('div');
  gaugeTrack.className = 'hud-gauge-track';

  const gaugeFill = document.createElement('div');
  gaugeFill.className = 'hud-gauge-fill';

  const gaugeText = document.createElement('div');
  gaugeText.className = 'hud-gauge-text';

  gaugeTrack.append(gaugeFill, gaugeText);
  gaugeWrap.append(gaugeLabel, gaugeTrack);

  // Helper: toon panel with title + value
  function createToonPanel(title: string): { el: HTMLDivElement; label: HTMLSpanElement } {
    const el = document.createElement('div');
    el.className = 'hud-panel';

    const titleEl = document.createElement('div');
    titleEl.className = 'hud-panel-title';
    titleEl.textContent = title;

    const label = document.createElement('span');
    label.className = 'hud-panel-value';

    el.append(titleEl, label);
    return { el, label };
  }

  const zonePanel = createToonPanel('Zone');
  const posPanel = createToonPanel('Position');

  hud.append(gaugeWrap, zonePanel.el, posPanel.el);
  document.body.appendChild(hud);

  // ─── HUD top-right: economy panels in a row ───────
  const hudRight = document.createElement('div');
  hudRight.style.cssText =
    'position:fixed;top:14px;right:14px;z-index:10;pointer-events:none;display:flex;flex-direction:row;gap:8px;';

  const moneyPanel = createToonPanel('Or');
  const ferPanel = createToonPanel('Feronium');
  const boiPanel = createToonPanel('Boisium');
  const chaPanel = createToonPanel('Charbonium');

  hudRight.append(moneyPanel.el, ferPanel.el, boiPanel.el, chaPanel.el);
  document.body.appendChild(hudRight);

  // Start economy polling
  fetchPlayerEconomy();
  economyInterval = setInterval(fetchPlayerEconomy, 10_000);

  // ─── Render loop ────────────────────────────────────
  const observer = scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;
    time += dt;

    // Input → server move (combine keys for diagonals)
    if (keys.size > 0 && !pendingMove) {
      const up = keys.has('ArrowUp');
      const down = keys.has('ArrowDown');
      const left = keys.has('ArrowLeft');
      const right = keys.has('ArrowRight');
      let dir: Direction | null = null;
      if (up && left)       dir = 'NW';
      else if (up && right)  dir = 'NE';
      else if (down && left) dir = 'SW';
      else if (down && right) dir = 'SE';
      else if (up)           dir = 'N';
      else if (down)         dir = 'S';
      else if (left)         dir = 'W';
      else if (right)        dir = 'E';
      if (dir) tryMoveServer(dir);
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
      gaugeFill.style.width = `${pct * 100}%`;
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
    ferPanel.label.textContent = `${fer}`;
    boiPanel.label.textContent = `${boi}`;
    chaPanel.label.textContent = `${cha}`;

    if (economyReady) {
      if (money !== prevMoney) showDelta(moneyPanel.el, money - prevMoney, 'hud-delta--gold');
      if (fer   !== prevFer)   showDelta(ferPanel.el,   fer   - prevFer);
      if (boi   !== prevBoi)   showDelta(boiPanel.el,   boi   - prevBoi);
      if (cha   !== prevCha)   showDelta(chaPanel.el,   cha   - prevCha);
    } else if (money >= 0) {
      economyReady = true;
    }
    if (money >= 0) prevMoney = money;
    prevFer = fer;
    prevBoi = boi;
    prevCha = cha;

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
