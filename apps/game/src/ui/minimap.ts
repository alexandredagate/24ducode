import type { GameMap } from "../utils/parse-map";
import { TileType } from "../utils/parse-map";
import { requestMapGrid, onMapUpdate, type MapGridData } from "../services/socket";
import { serverGridToGameMap, serverToGrid } from "../services/map-converter";

const MINIMAP_SIZE = 200;

const COLORS = {
  void:       '#0d1a2e',
  water:      '#1a5590',
  waterDeep:  '#0e3a6a',
  island:     '#3daa55',
  discovered: '#d4952a',
  boat:       '#ffffff',
  boatGlow:   'rgba(255, 255, 255, 0.4)',
  home:       '#ff6688',
  bg:         'rgba(8, 18, 34, 0.9)',
  gridLine:   'rgba(80, 160, 255, 0.06)',
} as const;

export interface MinimapState {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  updateBoatPosition: (boatRow: number, boatCol: number) => void;
  dispose: () => void;
}

export function createMinimap(): MinimapState {
  const container = document.createElement('div');
  container.className = 'hud-minimap';

  const label = document.createElement('div');
  label.className = 'hud-minimap-label';
  label.textContent = 'CARTE MONDE';

  const canvas = document.createElement('canvas');
  canvas.width = MINIMAP_SIZE;
  canvas.height = MINIMAP_SIZE;
  canvas.className = 'hud-minimap-canvas';

  container.append(label, canvas);

  const ctx = canvas.getContext('2d')!;

  // Full map state — fetched via map:grid socket
  let fullMap: GameMap | null = null;
  let homeRow: number | null = null;
  let homeCol: number | null = null;
  let boatRow = 0;
  let boatCol = 0;

  // Cached cell rendering
  let cachedScale = 0;
  let cachedOffsetX = 0;
  let cachedOffsetY = 0;

  function processGridData(data: MapGridData) {
    fullMap = serverGridToGameMap(data);
    const meta = { minX: data.minX, maxX: data.maxX, minY: data.minY, maxY: data.maxY };
    const home = serverToGrid(5, 3, meta);
    homeRow = home.row;
    homeCol = home.col;
    redraw();
  }

  function redraw() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    if (!fullMap) {
      ctx.fillStyle = 'rgba(126, 184, 255, 0.4)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Chargement...', MINIMAP_SIZE / 2, MINIMAP_SIZE / 2);
      return;
    }

    const map = fullMap;
    const padding = 6;
    const scale = Math.min(
      (MINIMAP_SIZE - padding * 2) / map.cols,
      (MINIMAP_SIZE - padding * 2) / map.rows,
    );
    const cellSize = Math.max(1, scale);
    cachedScale = cellSize;

    const totalW = map.cols * cellSize;
    const totalH = map.rows * cellSize;
    cachedOffsetX = Math.floor((MINIMAP_SIZE - totalW) / 2);
    cachedOffsetY = Math.floor((MINIMAP_SIZE - totalH) / 2);

    // Draw grid lines (subtle)
    if (cellSize >= 3) {
      ctx.strokeStyle = COLORS.gridLine;
      ctx.lineWidth = 0.5;
      for (let r = 0; r <= map.rows; r += 5) {
        const y = cachedOffsetY + r * cellSize;
        ctx.beginPath();
        ctx.moveTo(cachedOffsetX, y);
        ctx.lineTo(cachedOffsetX + totalW, y);
        ctx.stroke();
      }
      for (let c = 0; c <= map.cols; c += 5) {
        const x = cachedOffsetX + c * cellSize;
        ctx.beginPath();
        ctx.moveTo(x, cachedOffsetY);
        ctx.lineTo(x, cachedOffsetY + totalH);
        ctx.stroke();
      }
    }

    // Draw cells
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const cell = map.cells[r]?.[c];
        if (!cell) continue;

        let color: string;
        switch (cell.type) {
          case TileType.Water:      color = COLORS.water; break;
          case TileType.Island:     color = COLORS.island; break;
          case TileType.Discovered: color = COLORS.discovered; break;
          default:                  color = COLORS.void; break;
        }

        ctx.fillStyle = color;
        const x = cachedOffsetX + c * cellSize;
        const y = cachedOffsetY + r * cellSize;
        ctx.fillRect(x, y, Math.ceil(cellSize), Math.ceil(cellSize));
      }
    }

    // Draw home marker
    if (homeRow != null && homeCol != null && homeRow < map.rows && homeCol < map.cols) {
      const hx = cachedOffsetX + homeCol * cellSize + cellSize / 2;
      const hy = cachedOffsetY + homeRow * cellSize + cellSize / 2;
      const hr = Math.max(2.5, cellSize * 0.8);

      // Home glow
      const homeGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr * 3);
      homeGrad.addColorStop(0, 'rgba(255, 102, 136, 0.3)');
      homeGrad.addColorStop(1, 'rgba(255, 102, 136, 0)');
      ctx.fillStyle = homeGrad;
      ctx.beginPath();
      ctx.arc(hx, hy, hr * 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = COLORS.home;
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw boat
    drawBoat();

    // Compass
    ctx.fillStyle = 'rgba(200, 220, 255, 0.45)';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', MINIMAP_SIZE / 2, 9);
    ctx.fillText('S', MINIMAP_SIZE / 2, MINIMAP_SIZE - 2);
    ctx.textAlign = 'left';
    ctx.fillText('W', 1, MINIMAP_SIZE / 2 + 3);
    ctx.textAlign = 'right';
    ctx.fillText('E', MINIMAP_SIZE - 1, MINIMAP_SIZE / 2 + 3);
  }

  function drawBoat() {
    if (!fullMap) return;

    const bx = cachedOffsetX + boatCol * cachedScale + cachedScale / 2;
    const by = cachedOffsetY + boatRow * cachedScale + cachedScale / 2;

    // Pulsing glow
    const glowRadius = Math.max(8, cachedScale * 3);
    const grad = ctx.createRadialGradient(bx, by, 0, bx, by, glowRadius);
    grad.addColorStop(0, COLORS.boatGlow);
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bx, by, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Boat dot
    const dotR = Math.max(2.5, cachedScale * 0.7);
    ctx.fillStyle = COLORS.boat;
    ctx.beginPath();
    ctx.arc(bx, by, dotR, 0, Math.PI * 2);
    ctx.fill();

    // Outline
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Initial fetch — delay slightly to avoid collision with scene's initial requestMapGrid
  setTimeout(() => {
    requestMapGrid().then(processGridData).catch((err) => {
      console.warn('[minimap] initial map:grid failed:', err);
    });
  }, 2000);

  // Subscribe to map updates for real-time refresh
  const unsubMap = onMapUpdate((data) => {
    processGridData(data);
  });

  function updateBoatPosition(row: number, col: number) {
    if (row === boatRow && col === boatCol) return;
    boatRow = row;
    boatCol = col;
    redraw();
  }

  return {
    canvas,
    container,
    updateBoatPosition,
    dispose() {
      container.remove();
      unsubMap();
    },
  };
}
