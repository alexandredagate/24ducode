import { Color3, Mesh, MeshBuilder, StandardMaterial, VertexBuffer, type Scene } from "babylonjs";

type Grid = number[][];


interface CellGroup {
  cells: [number, number][];
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

function floodFillIslands(grid: Grid): CellGroup[] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const visited: boolean[][] = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const groups: CellGroup[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== 2 || visited[r][c]) continue;

      const cells: [number, number][] = [];
      const queue: [number, number][] = [[r, c]];
      visited[r][c] = true;
      let minR = r, maxR = r, minC = c, maxC = c;

      while (queue.length > 0) {
        const [cr, cc] = queue.shift()!;
        cells.push([cr, cc]);
        if (cr < minR) minR = cr;
        if (cr > maxR) maxR = cr;
        if (cc < minC) minC = cc;
        if (cc > maxC) maxC = cc;

        const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dr, dc] of dirs) {
          const nr = cr + dr, nc = cc + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc] && grid[nr][nc] === 2) {
            visited[nr][nc] = true;
            queue.push([nr, nc]);
          }
        }
      }

      groups.push({ cells, minRow: minR, maxRow: maxR, minCol: minC, maxCol: maxC });
    }
  }

  return groups;
}

function noise(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}


function buildIslandMesh(
  group: CellGroup,
  _grid: Grid,
  step: number,
  tileSize: number,
  originX: number,
  originZ: number,
  mat: StandardMaterial,
  scene: Scene,
): Mesh | null {
  const islandSet = new Set<string>();
  for (const [r, c] of group.cells) islandSet.add(`${r}_${c}`);

  const MARGIN = 0.6;
  const SUBS_PER_CELL = 6;
  const gw = group.maxCol - group.minCol + 1 + 2 * MARGIN;
  const gh = group.maxRow - group.minRow + 1 + 2 * MARGIN;
  const subs = Math.max(4, Math.round(Math.max(gw, gh) * SUBS_PER_CELL));

  const centerGC = (group.minCol + group.maxCol) / 2;
  const centerGR = (group.minRow + group.maxRow) / 2;
  const centerWX = originX + centerGC * step;
  const centerWZ = originZ + centerGR * step;

  const ground = MeshBuilder.CreateGround(`island_ground`, {
    width: gw * step,
    height: gh * step,
    subdivisions: subs,
    updatable: true,
  }, scene);

  ground.position.set(centerWX, 0.5, centerWZ);

  const positions = ground.getVerticesData(VertexBuffer.PositionKind);
  if (!positions) return null;

  const peakH = tileSize * 0.2 + group.cells.length * 0.03;

  for (let i = 0; i < positions.length; i += 3) {
    const wx = positions[i] + centerWX;
    const wz = positions[i + 2] + centerWZ;

    const gc = (wx - originX) / step;
    const gr = (wz - originZ) / step;

    const nearR = Math.round(gr);
    const nearC = Math.round(gc);
    const onIsland = islandSet.has(`${nearR}_${nearC}`);

    if (!onIsland) {
      positions[i + 1] = -0.6;
      continue;
    }

    let minEdgeDist = Infinity;
    for (let dr = -3; dr <= 3; dr++) {
      for (let dc = -3; dc <= 3; dc++) {
        const cr = nearR + dr;
        const cc = nearC + dc;
        if (!islandSet.has(`${cr}_${cc}`)) {
          const d = Math.sqrt((gr - cr) ** 2 + (gc - cc) ** 2);
          minEdgeDist = Math.min(minEdgeDist, d);
        }
      }
    }

    const edgeFade = smoothstep((minEdgeDist - 0.35) / 0.6);
    const n = noise(wx * 4.3 + 1.7, wz * 3.1 + 5.3) * 0.2 + 0.9;
    positions[i + 1] = peakH * edgeFade * n;
  }

  ground.updateVerticesData(VertexBuffer.PositionKind, positions);
  ground.convertToFlatShadedMesh();

  const finalPos = ground.getVerticesData(VertexBuffer.PositionKind);
  if (finalPos) {
    const colors: number[] = [];
    for (let i = 0; i < finalPos.length; i += 3) {
      const vx = finalPos[i] + centerWX;
      const vz = finalPos[i + 2] + centerWZ;
      const vy = finalPos[i + 1];

      const gc = (vx - originX) / step;
      const gr = (vz - originZ) / step;
      const nr = Math.round(gr);
      const nc = Math.round(gc);
      const onIsland = islandSet.has(`${nr}_${nc}`);

      if (!onIsland || vy < -0.3) {
        colors.push(0.05, 0.15, 0.35, 1);
        continue;
      }

      let edgeDist = Infinity;
      for (let dr = -3; dr <= 3; dr++) {
        for (let dc = -3; dc <= 3; dc++) {
          const cr = nr + dr;
          const cc = nc + dc;
          if (!islandSet.has(`${cr}_${cc}`)) {
            const d = Math.sqrt((gr - cr) ** 2 + (gc - cc) ** 2);
            edgeDist = Math.min(edgeDist, d);
          }
        }
      }

      if (edgeDist < 0.7) {
        colors.push(0.85, 0.78, 0.55, 1);
      } else if (edgeDist < 1.1) {
        const t = (edgeDist - 0.7) / 0.4;
        colors.push(
          0.85 - t * 0.43,
          0.78 - t * 0.13,
          0.55 - t * 0.25,
          1,
        );
      } else if (edgeDist < 1.8) {
        colors.push(0.42, 0.65, 0.30, 1);
      } else {
        colors.push(0.28, 0.50, 0.20, 1);
      }
    }
    ground.setVerticesData(VertexBuffer.ColorKind, colors);
  }

  ground.material = mat;
  return ground;
}

export function buildIslandMeshes(
  grid: Grid,
  tileSize: number,
  gap: number,
  scene: Scene,
): Mesh[] {
  const step = tileSize + gap;
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  const groups = floodFillIslands(grid);
  const meshes: Mesh[] = [];

  const mat = new StandardMaterial('islandMat', scene);
  mat.diffuseColor = Color3.White();
  mat.specularColor = new Color3(0.05, 0.05, 0.05);
  mat.backFaceCulling = false;

  const originX = -((cols - 1) / 2) * step;
  const originZ = -((rows - 1) / 2) * step;

  for (const group of groups) {
    const mesh = buildIslandMesh(group, grid, step, tileSize, originX, originZ, mat, scene);
    if (mesh) meshes.push(mesh);
  }

  return meshes;
}
