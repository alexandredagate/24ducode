import { Color3, FresnelParameters, Mesh, StandardMaterial, VertexData, type Engine, type Scene } from "babylonjs";
import { TileType, type TileCell } from "./parse-map";

const TILE_SIZE = 1.0;

function createRoundedBoxMesh(
  name: string,
  halfW: number, halfH: number, halfD: number,
  roundness: number, segments: number,
  scene: Scene,
): Mesh {
  const e = roundness;
  const latSegs = segments;
  const lonSegs = segments * 2;

  function signedPow(v: number, p: number): number {
    if (v === 0) return 0;
    return Math.sign(v) * Math.pow(Math.abs(v), p);
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= latSegs; i++) {
    const eta = -Math.PI / 2 + (i / latSegs) * Math.PI;
    const cosEta = Math.cos(eta);
    const sinEta = Math.sin(eta);

    for (let j = 0; j <= lonSegs; j++) {
      const omega = -Math.PI + (j / lonSegs) * 2 * Math.PI;
      const cosOmega = Math.cos(omega);
      const sinOmega = Math.sin(omega);

      const x = halfW * signedPow(cosEta, e) * signedPow(cosOmega, e);
      const y = halfH * signedPow(sinEta, e);
      const z = halfD * signedPow(cosEta, e) * signedPow(sinOmega, e);

      let nx = signedPow(cosEta, 2 - e) * signedPow(cosOmega, 2 - e) / halfW;
      let ny = signedPow(sinEta, 2 - e) / halfH;
      let nz = signedPow(cosEta, 2 - e) * signedPow(sinOmega, 2 - e) / halfD;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len; ny /= len; nz /= len;

      positions.push(x, y, z);
      normals.push(nx, ny, nz);
    }
  }

  for (let i = 0; i < latSegs; i++) {
    for (let j = 0; j < lonSegs; j++) {
      const a = i * (lonSegs + 1) + j;
      const b = a + 1;
      const c = a + (lonSegs + 1);
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.indices = indices;
  vd.applyToMesh(mesh);

  return mesh;
}

function noise2d(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

const WATER_PALETTE = [
  { diffuse: new Color3(0.08, 0.38, 0.65), emissive: new Color3(0.02, 0.08, 0.16) },
  { diffuse: new Color3(0.10, 0.42, 0.70), emissive: new Color3(0.02, 0.09, 0.18) },
  { diffuse: new Color3(0.14, 0.48, 0.75), emissive: new Color3(0.03, 0.10, 0.20) },
  { diffuse: new Color3(0.11, 0.44, 0.72), emissive: new Color3(0.02, 0.09, 0.18) },
  { diffuse: new Color3(0.18, 0.55, 0.82), emissive: new Color3(0.04, 0.12, 0.22) },
  { diffuse: new Color3(0.09, 0.40, 0.68), emissive: new Color3(0.02, 0.08, 0.17) },
  { diffuse: new Color3(0.15, 0.50, 0.78), emissive: new Color3(0.03, 0.11, 0.20) },
  { diffuse: new Color3(0.12, 0.46, 0.74), emissive: new Color3(0.03, 0.10, 0.19) },
];

interface FoamPatch {
  mesh: Mesh;
  baseOffX: number;
  baseOffZ: number;
  driftPhase: number;
}

interface WaterTile {
  mesh: Mesh;
  foams: FoamPatch[];
  worldX: number;
  worldZ: number;
  rngOffset: number;
  animated: boolean;
}

export { createRoundedBoxMesh };

export function createWaterTiles(scene: Scene, engine: Engine, cells: TileCell[], originX: number, originZ: number) {
  const master = createRoundedBoxMesh(
    'waterTileMaster',
    TILE_SIZE / 2,
    0.30,
    TILE_SIZE / 2,
    0.35,
    12,
    scene,
  );
  master.isVisible = false;

  const foamMasters = [
    createRoundedBoxMesh('foamMasterA', TILE_SIZE * 0.28, 0.04, TILE_SIZE * 0.28, 0.25, 6, scene),
    createRoundedBoxMesh('foamMasterB', TILE_SIZE * 0.18, 0.04, TILE_SIZE * 0.22, 0.25, 6, scene),
  ];
  foamMasters.forEach(m => { m.isVisible = false; });

  const foamMat = new StandardMaterial('foamMat', scene);
  foamMat.diffuseColor = new Color3(0.82, 0.92, 0.98);
  foamMat.emissiveColor = new Color3(0.35, 0.42, 0.50);
  foamMat.specularColor = new Color3(0.05, 0.05, 0.05);
  foamMat.alpha = 0.55;
  foamMat.backFaceCulling = false;

  const fresnelParams = new FresnelParameters();
  fresnelParams.bias = 0.1;
  fresnelParams.power = 2.0;
  fresnelParams.leftColor = new Color3(0.4, 0.65, 0.9);
  fresnelParams.rightColor = new Color3(0, 0, 0);

  const materials = WATER_PALETTE.map((pal, i) => {
    const mat = new StandardMaterial(`waterMat_${i}`, scene);
    mat.diffuseColor = pal.diffuse;
    mat.emissiveColor = pal.emissive;
    mat.specularColor = new Color3(0.4, 0.45, 0.5);
    mat.specularPower = 48;
    mat.emissiveFresnelParameters = fresnelParams;
    mat.backFaceCulling = false;
    return mat;
  });

  const tiles: WaterTile[] = [];

  for (const cell of cells) {
    const x = originX + cell.col * TILE_SIZE;
    const z = originZ + cell.row * TILE_SIZE;

    const tileMesh = master.clone(`waterTile_${cell.row}_${cell.col}`);
    tileMesh.isVisible = true;
    tileMesh.position.set(x, 0, z);

    const colorIdx = Math.floor(noise2d(x, z) * WATER_PALETTE.length) % WATER_PALETTE.length;
    tileMesh.material = materials[colorIdx];

    const foams: FoamPatch[] = [];
    for (let f = 0; f < 2; f++) {
      const seed1 = noise2d(x + f * 17.3, z + f * 23.7);
      const seed2 = noise2d(x + f * 41.1, z + f * 7.9);
      const foamIdx = f % foamMasters.length;

      const foam = foamMasters[foamIdx].clone(`foam_${cell.row}_${cell.col}_${f}`);
      foam.isVisible = true;
      foam.parent = tileMesh;
      foam.material = foamMat;

      const offX = (seed1 - 0.5) * 0.25;
      const offZ = (seed2 - 0.5) * 0.25;
      foam.position.set(offX, 0.30, offZ);

      foams.push({
        mesh: foam,
        baseOffX: offX,
        baseOffZ: offZ,
        driftPhase: seed1 * Math.PI * 2,
      });
    }

    tiles.push({
      mesh: tileMesh,
      foams,
      worldX: x,
      worldZ: z,
      rngOffset: noise2d(x, z) * Math.PI * 2,
      animated: cell.type === TileType.Water,
    });
  }

  let time = 0;

  scene.onBeforeRenderObservable.add(() => {
    time += engine.getDeltaTime() / 1000;

    for (const tile of tiles) {
      if (!tile.animated) continue;

      const px = tile.worldX * 0.4;
      const pz = tile.worldZ * 0.4;
      const rng = tile.rngOffset;

      const swell  = Math.sin(time * 0.6 + px + pz * 0.7)         * 0.12;
      const drift  = Math.sin(time * 0.35 + pz * 1.2 - px + rng)  * 0.07;
      const detail = Math.sin(time * 1.4 + rng * 2.0)              * 0.03;

      tile.mesh.position.y = swell + drift + detail;

      tile.mesh.rotation.x =
        Math.cos(time * 0.6 + px + pz * 0.7)        * 0.03 +
        Math.cos(time * 0.35 + pz * 1.2 - px + rng) * 0.015;
      tile.mesh.rotation.z =
        Math.cos(time * 0.5 + pz - px * 0.8 + rng)  * 0.025;

      const waveHeight = tile.mesh.position.y;
      const crest = Math.max(0, waveHeight) / 0.22;

      for (const fp of tile.foams) {
        const driftX = Math.sin(time * 0.3 + fp.driftPhase) * 0.04;
        const driftZ = Math.cos(time * 0.25 + fp.driftPhase * 1.3) * 0.04;
        fp.mesh.position.x = fp.baseOffX + driftX;
        fp.mesh.position.z = fp.baseOffZ + driftZ;

        const pulse = Math.sin(time * 1.5 + fp.driftPhase) * 0.12 + 0.88;
        const foamAlpha = Math.min(1, crest * 0.55 + 0.12) * pulse;
        fp.mesh.visibility = foamAlpha;

        const s = 0.75 + crest * 0.35;
        fp.mesh.scaling.set(s, 1, s);
      }
    }
  });

  const tileMeshMap = new Map<string, Mesh>();
  for (const tile of tiles) {
    const cell = cells.find(c => originX + c.col * TILE_SIZE === tile.worldX && originZ + c.row * TILE_SIZE === tile.worldZ);
    if (cell) tileMeshMap.set(`${cell.row}_${cell.col}`, tile.mesh);
  }

  return {
    tileMeshMap,
    // Expose internals for incremental addWaterTile
    _master: master,
    _foamMasters: foamMasters,
    _foamMat: foamMat,
    _materials: materials,
    _tiles: tiles,
    dispose() {
      master.dispose();
      for (const fm of foamMasters) fm.dispose();
    },
  };
}

export type WaterResult = ReturnType<typeof createWaterTiles>;

export function addWaterTile(
  wr: WaterResult,
  cell: TileCell,
  originX: number,
  originZ: number,
): Mesh | null {
  const x = originX + cell.col * TILE_SIZE;
  const z = originZ + cell.row * TILE_SIZE;

  const tileMesh = wr._master.clone(`waterTile_${cell.row}_${cell.col}`);
  tileMesh.isVisible = true;
  tileMesh.position.set(x, 0, z);

  const colorIdx = Math.floor(noise2d(x, z) * WATER_PALETTE.length) % WATER_PALETTE.length;
  tileMesh.material = wr._materials[colorIdx];

  const foams: FoamPatch[] = [];
  for (let f = 0; f < 2; f++) {
    const seed1 = noise2d(x + f * 17.3, z + f * 23.7);
    const seed2 = noise2d(x + f * 41.1, z + f * 7.9);
    const foamIdx = f % wr._foamMasters.length;

    const foam = wr._foamMasters[foamIdx].clone(`foam_${cell.row}_${cell.col}_${f}`);
    foam.isVisible = true;
    foam.parent = tileMesh;
    foam.material = wr._foamMat;

    const offX = (seed1 - 0.5) * 0.25;
    const offZ = (seed2 - 0.5) * 0.25;
    foam.position.set(offX, 0.30, offZ);

    foams.push({
      mesh: foam,
      baseOffX: offX,
      baseOffZ: offZ,
      driftPhase: seed1 * Math.PI * 2,
    });
  }

  wr._tiles.push({
    mesh: tileMesh,
    foams,
    worldX: x,
    worldZ: z,
    rngOffset: noise2d(x, z) * Math.PI * 2,
    animated: cell.type === TileType.Water,
  });

  return tileMesh;
}
