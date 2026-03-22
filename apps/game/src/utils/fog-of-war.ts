import { Color4, DynamicTexture, ParticleSystem, Vector3, type Engine, type Scene } from "babylonjs";
import type { GameMap } from "./parse-map";
import { TileType } from "./parse-map";

const TILE_SIZE = 1.0;
const FOG_Y = 0.3;

export interface FogResult {
  systems: ParticleSystem[];
  positionMap: Map<string, ParticleSystem[]>; // "row_col" → PS at that position
}

function createSmokeTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture('smokeTex', size, scene, false);
  const ctx = tex.getContext();

  ctx.clearRect(0, 0, size, size);

  const cx = size / 2, cy = size / 2, r = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  grad.addColorStop(0.15, 'rgba(240, 240, 248, 0.6)');
  grad.addColorStop(0.4, 'rgba(210, 210, 225, 0.3)');
  grad.addColorStop(0.7, 'rgba(185, 185, 200, 0.08)');
  grad.addColorStop(1, 'rgba(160, 160, 175, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.update(false);
  tex.hasAlpha = true;

  return tex;
}

function createFogEmitter(
  name: string,
  pos: Vector3,
  tex: DynamicTexture,
  scene: Scene,
  config: { rate: number; minSize: number; maxSize: number; alpha: number; boxSize: number },
): ParticleSystem {
  const ps = new ParticleSystem(name, 80, scene);
  ps.particleTexture = tex;

  ps.emitter = pos;
  ps.minEmitBox = new Vector3(-config.boxSize, -0.05, -config.boxSize);
  ps.maxEmitBox = new Vector3(config.boxSize, 0.15, config.boxSize);

  ps.color1 = new Color4(0.45, 0.45, 0.52, config.alpha);
  ps.color2 = new Color4(0.35, 0.35, 0.42, config.alpha * 0.7);
  ps.colorDead = new Color4(0.25, 0.25, 0.32, 0);

  ps.minSize = config.minSize;
  ps.maxSize = config.maxSize;
  ps.minLifeTime = 4;
  ps.maxLifeTime = 9;
  ps.emitRate = config.rate;

  ps.direction1 = new Vector3(-0.12, 0.01, -0.12);
  ps.direction2 = new Vector3(0.12, 0.08, 0.12);
  ps.minEmitPower = 0.02;
  ps.maxEmitPower = 0.07;

  ps.gravity = new Vector3(0, 0.003, 0);
  ps.minAngularSpeed = -0.3;
  ps.maxAngularSpeed = 0.3;
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;

  ps.start();
  return ps;
}

function samplePositions(positions: { pos: Vector3; row: number; col: number }[], spacing: number): { pos: Vector3; row: number; col: number }[] {
  const result: { pos: Vector3; row: number; col: number }[] = [];
  const used = new Set<string>();

  for (const p of positions) {
    const key = `${Math.round(p.pos.x / spacing)}_${Math.round(p.pos.z / spacing)}`;
    if (used.has(key)) continue;
    used.add(key);
    result.push(p);
  }

  return result;
}

export function createFogOfWar(
  scene: Scene,
  _engine: Engine,
  map: GameMap,
): FogResult {
  const originX = -(map.cols - 1) / 2;
  const originZ = -(map.rows - 1) / 2;

  const discovered = new Set<string>();
  for (const row of map.cells) {
    for (const cell of row) {
      if (cell.type !== TileType.Void) {
        discovered.add(`${cell.row}_${cell.col}`);
      }
    }
  }

  const smokeTex = createSmokeTexture(scene);
  const allPS: ParticleSystem[] = [];
  const positionMap = new Map<string, ParticleSystem[]>();

  const voidPositions: { pos: Vector3; row: number; col: number }[] = [];
  for (const row of map.cells) {
    for (const cell of row) {
      if (cell.type === TileType.Void) {
        voidPositions.push({
          pos: new Vector3(originX + cell.col * TILE_SIZE, FOG_Y, originZ + cell.row * TILE_SIZE),
          row: cell.row,
          col: cell.col,
        });
      }
    }
  }

  const borderPositions: { pos: Vector3; row: number; col: number }[] = [];
  const BORDER = 3;
  for (let r = -BORDER; r < map.rows + BORDER; r++) {
    for (let c = -BORDER; c < map.cols + BORDER; c++) {
      if (r >= 0 && r < map.rows && c >= 0 && c < map.cols) continue;
      borderPositions.push({
        pos: new Vector3(originX + c * TILE_SIZE, FOG_Y, originZ + r * TILE_SIZE),
        row: r,
        col: c,
      });
    }
  }

  function registerPS(ps: ParticleSystem, row: number, col: number, radius: number) {
    const r = Math.ceil(radius);
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        const key = `${row + dr}_${col + dc}`;
        const list = positionMap.get(key) ?? [];
        list.push(ps);
        positionMap.set(key, list);
      }
    }
  }

  const sampledVoid = samplePositions(voidPositions, 1.5);
  for (let i = 0; i < sampledVoid.length; i++) {
    const sv = sampledVoid[i];
    const ps = createFogEmitter(
      `fogVoid_${i}`, sv.pos, smokeTex, scene,
      { rate: 6, minSize: 1.0, maxSize: 2.5, alpha: 0.5, boxSize: 0.7 },
    );
    allPS.push(ps);
    registerPS(ps, sv.row, sv.col, 2);
  }

  const sampledBorder = samplePositions(borderPositions, 2.5);
  for (let i = 0; i < sampledBorder.length; i++) {
    const sb = sampledBorder[i];
    const ps = createFogEmitter(
      `fogBorder_${i}`, sb.pos, smokeTex, scene,
      { rate: 4, minSize: 2.0, maxSize: 4.5, alpha: 0.45, boxSize: 1.2 },
    );
    allPS.push(ps);
    registerPS(ps, sb.row, sb.col, 3);
  }

  return { systems: allPS, positionMap };
}

export function removeFogAt(fogResult: FogResult, row: number, col: number) {
  const key = `${row}_${col}`;
  const systems = fogResult.positionMap.get(key);
  if (!systems) return;

  for (const ps of systems) {
    ps.emitRate = 0;

    const idx = fogResult.systems.indexOf(ps);
    if (idx !== -1) {
      fogResult.systems.splice(idx, 1);
    }

    setTimeout(() => {
      ps.stop();
      ps.dispose();
    }, 10000);
  }

  fogResult.positionMap.delete(key);
}
