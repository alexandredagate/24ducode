import { Color3, Color4, DynamicTexture, Mesh, MeshBuilder, ParticleSystem, StandardMaterial, Vector3, type Engine, type Scene } from "babylonjs";
import type { GameMap } from "./parse-map";
import { TileType } from "./parse-map";

const TILE_SIZE = 1.0;
const FOG_Y = 0.7;
const FOG_PLANE_SIZE = 500;

function createSmokeTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture('smokeTex', size, scene, false);
  const ctx = tex.getContext();

  ctx.clearRect(0, 0, size, size);

  const cx = size / 2, cy = size / 2, r = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  grad.addColorStop(0.2, 'rgba(230, 230, 240, 0.6)');
  grad.addColorStop(0.5, 'rgba(200, 200, 215, 0.25)');
  grad.addColorStop(0.8, 'rgba(180, 180, 195, 0.06)');
  grad.addColorStop(1, 'rgba(160, 160, 175, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.update(false);
  tex.hasAlpha = true;

  return tex;
}

function createFogPlane(scene: Scene): Mesh {
  const mat = new StandardMaterial('fogPlaneMat', scene);
  mat.diffuseColor = new Color3(0.08, 0.10, 0.16);
  mat.emissiveColor = new Color3(0.04, 0.05, 0.08);
  mat.specularColor = Color3.Black();
  mat.backFaceCulling = false;

  const plane = MeshBuilder.CreateGround('fogPlane', {
    width: FOG_PLANE_SIZE,
    height: FOG_PLANE_SIZE,
  }, scene);
  plane.position.y = -0.3;
  plane.material = mat;

  return plane;
}

export function createFogOfWar(scene: Scene, _engine: Engine, map: GameMap) {
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

  createFogPlane(scene);

  const borderCells: { x: number; z: number }[] = [];

  const SCAN = 8;
  const rMin = -SCAN;
  const rMax = map.rows - 1 + SCAN;
  const cMin = -SCAN;
  const cMax = map.cols - 1 + SCAN;

  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      if (discovered.has(`${r}_${c}`)) continue;

      let isBorder = false;
      for (let dr = -2; dr <= 2 && !isBorder; dr++) {
        for (let dc = -2; dc <= 2 && !isBorder; dc++) {
          if (discovered.has(`${r + dr}_${c + dc}`)) {
            isBorder = true;
          }
        }
      }

      if (isBorder) {
        borderCells.push({
          x: originX + c * TILE_SIZE,
          z: originZ + r * TILE_SIZE,
        });
      }
    }
  }

  const smokeTex = createSmokeTexture(scene);

  const borderSampled = sampleCells(borderCells, 1.5);

  for (let i = 0; i < borderSampled.length; i++) {
    const fc = borderSampled[i];
    const ps = new ParticleSystem(`fogBorder_${i}`, 100, scene);
    ps.particleTexture = smokeTex;

    ps.emitter = new Vector3(fc.x, FOG_Y, fc.z);
    ps.minEmitBox = new Vector3(-0.7, -0.1, -0.7);
    ps.maxEmitBox = new Vector3(0.7, 0.3, 0.7);

    ps.color1 = new Color4(0.50, 0.50, 0.58, 0.5);
    ps.color2 = new Color4(0.40, 0.40, 0.48, 0.4);
    ps.colorDead = new Color4(0.30, 0.30, 0.38, 0);

    ps.minSize = 1.2;
    ps.maxSize = 2.8;
    ps.minLifeTime = 4;
    ps.maxLifeTime = 8;
    ps.emitRate = 6;

    ps.direction1 = new Vector3(-0.15, 0.01, -0.15);
    ps.direction2 = new Vector3(0.15, 0.12, 0.15);
    ps.minEmitPower = 0.02;
    ps.maxEmitPower = 0.08;

    ps.gravity = new Vector3(0, 0.003, 0);
    ps.minAngularSpeed = -0.4;
    ps.maxAngularSpeed = 0.4;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;

    ps.start();
  }

  const wispSampled = sampleCells(borderCells, 3.5);

  for (let i = 0; i < wispSampled.length; i++) {
    const fc = wispSampled[i];
    const ps = new ParticleSystem(`fogWisp_${i}`, 30, scene);
    ps.particleTexture = smokeTex;

    ps.emitter = new Vector3(fc.x, FOG_Y + 0.3, fc.z);
    ps.minEmitBox = new Vector3(-1.5, 0, -1.5);
    ps.maxEmitBox = new Vector3(1.5, 0.5, 1.5);

    ps.color1 = new Color4(0.48, 0.48, 0.55, 0.3);
    ps.color2 = new Color4(0.38, 0.38, 0.45, 0.2);
    ps.colorDead = new Color4(0.30, 0.30, 0.38, 0);

    ps.minSize = 2.0;
    ps.maxSize = 4.0;
    ps.minLifeTime = 5;
    ps.maxLifeTime = 10;
    ps.emitRate = 2;

    ps.direction1 = new Vector3(-0.08, 0.03, -0.08);
    ps.direction2 = new Vector3(0.08, 0.12, 0.08);
    ps.minEmitPower = 0.02;
    ps.maxEmitPower = 0.06;

    ps.gravity = new Vector3(0, 0.006, 0);
    ps.minAngularSpeed = -0.15;
    ps.maxAngularSpeed = 0.15;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;

    ps.start();
  }

  // ─── Layer 3 : nappe de fumée infinie ───────────────
  // 4 systèmes massifs (un par côté) + 1 au centre,
  // avec des emit boxes très larges couvrant tout le fog plane

  const mapCX = originX + (map.cols - 1) / 2;
  const mapCZ = originZ + (map.rows - 1) / 2;
  const SPREAD = FOG_PLANE_SIZE / 2;

  const blanketEmitters = [
    new Vector3(mapCX, FOG_Y - 0.1, mapCZ - SPREAD * 0.5), // nord
    new Vector3(mapCX, FOG_Y - 0.1, mapCZ + SPREAD * 0.5), // sud
    new Vector3(mapCX - SPREAD * 0.5, FOG_Y - 0.1, mapCZ), // ouest
    new Vector3(mapCX + SPREAD * 0.5, FOG_Y - 0.1, mapCZ), // est
    new Vector3(mapCX, FOG_Y - 0.1, mapCZ),                 // centre
  ];

  for (let i = 0; i < blanketEmitters.length; i++) {
    const ps = new ParticleSystem(`fogBlanket_${i}`, 300, scene);
    ps.particleTexture = smokeTex;

    ps.emitter = blanketEmitters[i];
    ps.minEmitBox = new Vector3(-SPREAD * 0.5, -0.1, -SPREAD * 0.5);
    ps.maxEmitBox = new Vector3(SPREAD * 0.5, 0.3, SPREAD * 0.5);

    ps.color1 = new Color4(0.35, 0.35, 0.42, 0.45);
    ps.color2 = new Color4(0.25, 0.25, 0.32, 0.35);
    ps.colorDead = new Color4(0.20, 0.20, 0.28, 0);

    ps.minSize = 5.0;
    ps.maxSize = 12.0;
    ps.minLifeTime = 8;
    ps.maxLifeTime = 15;
    ps.emitRate = 12;

    ps.direction1 = new Vector3(-0.05, 0.005, -0.05);
    ps.direction2 = new Vector3(0.05, 0.06, 0.05);
    ps.minEmitPower = 0.01;
    ps.maxEmitPower = 0.04;

    ps.gravity = new Vector3(0, 0.002, 0);
    ps.minAngularSpeed = -0.1;
    ps.maxAngularSpeed = 0.1;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;

    ps.start();
  }
}

function sampleCells(cells: { x: number; z: number }[], spacing: number): { x: number; z: number }[] {
  const result: { x: number; z: number }[] = [];
  const used = new Set<string>();

  for (const c of cells) {
    const key = `${Math.round(c.x / spacing)}_${Math.round(c.z / spacing)}`;
    if (used.has(key)) continue;
    used.add(key);
    result.push(c);
  }

  return result;
}
