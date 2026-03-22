import type { ArcRotateCamera, Engine, Mesh, Scene, TransformNode } from "babylonjs";
import { Color4, DynamicTexture, ParticleSystem, StandardMaterial, Vector3 } from "babylonjs";
import type { GameMap } from "./parse-map";
import { moveShip, type Direction, type ShipMoveResponse, type MapMeta } from "../services/socket";
import { serverToGrid, gridToServer } from "../services/map-converter";
import { createEmojiBillboard, computeEmojiScale } from "./emoji-billboard";
import {
  buildHud, fetchAndUpdatePlayerInfo,
  fetchAndUpdateTaxes, fetchAndUpdateThefts, fetchAndUpdateMarketplace,
  startTheftCountdown, setupBrokerActivityLog,
} from "../ui/hud";
import { createMinimap } from "../ui/minimap";

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

function createWakeParticles(scene: Scene, boat: TransformNode): ParticleSystem {
  const texSize = 64;
  const tex = new DynamicTexture('wakeTex', texSize, scene, false);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, texSize, texSize);
  const grad = ctx.createRadialGradient(texSize / 2, texSize / 2, 0, texSize / 2, texSize / 2, texSize / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.3, 'rgba(200,220,255,0.5)');
  grad.addColorStop(0.7, 'rgba(150,200,255,0.15)');
  grad.addColorStop(1, 'rgba(100,180,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, texSize, texSize);
  tex.update(false);
  tex.hasAlpha = true;

  const ps = new ParticleSystem('wake', 120, scene);
  ps.particleTexture = tex;
  ps.emitter = boat as any;
  ps.minEmitBox = new Vector3(-0.2, -0.1, -0.4);
  ps.maxEmitBox = new Vector3(0.2, 0.05, -0.2);

  ps.color1 = new Color4(0.7, 0.85, 1.0, 0.5);
  ps.color2 = new Color4(0.5, 0.7, 0.9, 0.35);
  ps.colorDead = new Color4(0.3, 0.5, 0.8, 0);

  ps.minSize = 0.15;
  ps.maxSize = 0.45;
  ps.minLifeTime = 0.8;
  ps.maxLifeTime = 2.0;
  ps.emitRate = 25;

  ps.direction1 = new Vector3(-0.15, 0.02, -0.3);
  ps.direction2 = new Vector3(0.15, 0.08, -0.1);
  ps.minEmitPower = 0.05;
  ps.maxEmitPower = 0.15;

  ps.gravity = new Vector3(0, -0.01, 0);
  ps.minAngularSpeed = -0.5;
  ps.maxAngularSpeed = 0.5;
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;

  ps.start();
  return ps;
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
  let economyReady = false;
  let prevMoney = 0;
  let prevFer = 0;
  let prevBoi = 0;
  let prevCha = 0;

  // Death emoji state
  const DEATH_EMOJI_DURATION = 5;
  const DEATH_EMOJI_Y_OFFSET = 1.2;
  let deathEmoji: Mesh | null = null;
  let deathEmojiTimer = 0;

  boat.position.x = worldX;
  boat.position.z = worldZ;
  boat.rotation.y = currentHeading;

  const wakePS = createWakeParticles(scene, boat);

  const hud = buildHud();
  let energyMax = 30;

  // Minimap — fetches full map via map:grid and auto-updates via map:update
  const minimap = createMinimap();
  const minimapContainer = document.createElement('div');
  minimapContainer.className = 'hud-bottom-left';
  minimapContainer.appendChild(minimap.container);
  hud.root.appendChild(minimapContainer);

  // Initial minimap boat position
  minimap.updateBoatPosition(startRow, startCol);

  // Fetch all HUD data — sequential to avoid socket handler collisions
  async function refreshAllData() {
    try {
      const details = await fetchAndUpdatePlayerInfo(hud);
      if (details) {
        money = details.money;
        resources = details.resources;
      }
      await fetchAndUpdateTaxes(hud);
      await fetchAndUpdateThefts(hud);
      await fetchAndUpdateMarketplace(hud);
    } catch {
      // refresh failed silently
    }
  }

  refreshAllData();
  const dataInterval = setInterval(refreshAllData, 10_000);

  // Theft countdown (1s tick)
  const stopTheftCountdown = startTheftCountdown(hud);

  // Broker events → activity log (chat)
  const unsubBrokerLog = setupBrokerActivityLog(hud);

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
      refreshAllData();
    } catch {
      // move failed
    } finally {
      pendingMove = false;
    }
  }

  let minimapTimer = 0;

  const observer = scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;
    time += dt;

    // Input
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

    // Wake intensity
    wakePS.emitRate = dist > 0.01 ? 50 : 12;

    // Energy gauge
    if (energy >= 0) {
      if (energy > energyMax) energyMax = energy;
      const pct = Math.max(0, Math.min(energyMax, energy)) / energyMax;
      hud.energyGaugeFill.style.width = `${pct * 100}%`;
      hud.energyGaugeText.textContent = `${energy} / ${energyMax}`;
      hud.energyGaugeFill.classList.toggle('low', pct < 0.25);
      if (pct > 0.5) {
        hud.energyGaugeFill.style.background = 'linear-gradient(90deg, #30b060, #50d880, #60e890)';
      } else if (pct > 0.25) {
        hud.energyGaugeFill.style.background = 'linear-gradient(90deg, #d0a020, #e0c030, #f0d840)';
      } else {
        hud.energyGaugeFill.style.background = 'linear-gradient(90deg, #c02020, #e04040, #ff5050)';
      }
    } else {
      hud.energyGaugeText.textContent = '';
    }

    // Zone & position
    hud.zoneLabel.textContent = currentZone >= 0 ? `Zone ${toRoman(currentZone)}` : '--';
    if (mapMeta) {
      const server = gridToServer(gridRow, gridCol, mapMeta);
      hud.posLabel.textContent = `${server.x}, ${server.y}`;
    } else {
      hud.posLabel.textContent = `${gridCol}, ${gridRow}`;
    }

    // Resources
    hud.moneyPanel.label.textContent = money >= 0 ? `${money}` : '--';
    const fer = resources.find(r => r.type === 'FERONIUM')?.quantity ?? 0;
    const boi = resources.find(r => r.type === 'BOISIUM')?.quantity ?? 0;
    const cha = resources.find(r => r.type === 'CHARBONIUM')?.quantity ?? 0;
    hud.ferPanel.label.textContent = `${fer}`;
    hud.boiPanel.label.textContent = `${boi}`;
    hud.chaPanel.label.textContent = `${cha}`;

    // Resource deltas
    if (economyReady) {
      if (money !== prevMoney) hud.showDelta(hud.moneyPanel.el, money - prevMoney, 'hud-delta--gold');
      if (fer   !== prevFer)   hud.showDelta(hud.ferPanel.el,   fer   - prevFer);
      if (boi   !== prevBoi)   hud.showDelta(hud.boiPanel.el,   boi   - prevBoi);
      if (cha   !== prevCha)   hud.showDelta(hud.chaPanel.el,   cha   - prevCha);
    } else if (money >= 0) {
      economyReady = true;
    }
    if (money >= 0) prevMoney = money;
    prevFer = fer;
    prevBoi = boi;
    prevCha = cha;

    // Minimap boat position (update every 0.5s to avoid perf hit)
    minimapTimer += dt;
    if (minimapTimer > 0.5) {
      minimapTimer = 0;
      minimap.updateBoatPosition(gridRow, gridCol);
    }

    // Death emoji
    if (energy === 0 && prevEnergy > 0 && !deathEmoji) {
      deathEmoji = createEmojiBillboard("\u2620\uFE0F", "deathEmoji", scene, 1.2);
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
      const prevWX = worldX;
      const prevWZ = worldZ;

      currentTileMeshes = newTileMeshes;
      mapMeta = newMeta;
      originX = -(newMap.cols - 1) / 2;
      originZ = -(newMap.rows - 1) / 2;

      if (newMeta) {
        const server = gridToServer(gridRow, gridCol, mapMeta!);
        const pos = serverToGrid(server.x, server.y, newMeta);
        gridRow = pos.row;
        gridCol = pos.col;
      }

      const newTargetX = toWorldX(gridCol);
      const newTargetZ = toWorldZ(gridRow);
      const shiftX = newTargetX - prevWX;
      const shiftZ = newTargetZ - prevWZ;

      if (Math.abs(shiftX) < 3 && Math.abs(shiftZ) < 3) {
        targetX = newTargetX;
        targetZ = newTargetZ;
      } else {
        worldX = newTargetX;
        worldZ = newTargetZ;
        targetX = newTargetX;
        targetZ = newTargetZ;
        boat.position.x = worldX;
        boat.position.z = worldZ;
      }

      // Refresh minimap boat position (map data auto-updates via socket)
      minimap.updateBoatPosition(gridRow, gridCol);
    },

    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      hud.dispose();
      minimap.dispose();
      clearInterval(dataInterval);
      stopTheftCountdown();
      unsubBrokerLog();
      if (deathEmoji) { deathEmoji.dispose(); deathEmoji = null; }
      wakePS.stop();
      wakePS.dispose();
    },
  };
}
