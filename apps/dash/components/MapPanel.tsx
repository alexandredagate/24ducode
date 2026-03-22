"use client";

import { useMemo, useState } from "react";
import type { MapGrid } from "../hooks/useSocket";

interface MapPanelProps {
  mapGrid: MapGrid | null;
  shipPosition: { x: number; y: number } | null;
  onRefresh: () => void;
}

// Zone-aware cell colors: [zone][cellType]
// cellType: 0=unknown, 1=sea, 2=sand
const ZONE_SEA_COLORS: Record<number, string> = {
  0: "#0f1a2e",
  1: "#0c2d6b",
  2: "#1a1570",
  3: "#1a4a2e",
  4: "#4a1a1a",
};

const ZONE_SAND_COLORS: Record<number, string> = {
  0: "#b8860b",
  1: "#34d399",
  2: "#818cf8",
  3: "#f59e0b",
  4: "#f87171",
};

const ZONE_LABELS: Record<number, { name: string; seaColor: string; sandColor: string }> = {
  1: { name: "Zone 1", seaColor: "#0c2d6b", sandColor: "#34d399" },
  2: { name: "Zone 2", seaColor: "#1a1570", sandColor: "#818cf8" },
  3: { name: "Zone 3", seaColor: "#1a4a2e", sandColor: "#f59e0b" },
  4: { name: "Zone 4", seaColor: "#4a1a1a", sandColor: "#f87171" },
};

const CELL_LABELS: Record<string, string> = {
  "0": "Inexplore",
  "1": "Eau",
  "2": "Ile",
};

export function MapPanel({ mapGrid, shipPosition, onRefresh }: MapPanelProps) {
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number; type: string; zone: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showZones, setShowZones] = useState(true);

  const stats = useMemo(() => {
    if (!mapGrid) return null;
    let water = 0, known = 0, discovered = 0, unknown = 0;
    const zoneCounts: Record<number, number> = {};
    for (let rowIdx = 0; rowIdx < mapGrid.grid.length; rowIdx++) {
      const row = mapGrid.grid[rowIdx];
      const zoneRow = mapGrid.zoneGrid?.[rowIdx];
      for (let colIdx = 0; colIdx < row.length; colIdx++) {
        const cell = row[colIdx];
        const zone = zoneRow ? Number(zoneRow[colIdx]) || 0 : 0;
        if (cell === "1") { water++; if (zone > 0) zoneCounts[zone] = (zoneCounts[zone] ?? 0) + 1; }
        else if (cell === "2") { known++; if (zone > 0) zoneCounts[zone] = (zoneCounts[zone] ?? 0) + 1; }
        else unknown++;
      }
    }
    const total = water + known + unknown;
    const explored = water + known;
    return { water, known, discovered, unknown, total, explored, exploredPct: total > 0 ? Math.round((explored / total) * 100) : 0, zoneCounts };
  }, [mapGrid]);

  if (!mapGrid) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="card p-12 text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center animate-float"
            style={{ background: "rgba(0,229,255,0.06)", border: "1px solid rgba(0,229,255,0.12)" }}>
            <span className="text-3xl">🗺</span>
          </div>
          <p className="text-zinc-400 text-sm">Chargement de la carte...</p>
          <div className="mt-4 mx-auto w-32 energy-gauge">
            <div className="energy-gauge-fill bg-cyan-500 progress-scan" style={{ width: "60%" }} />
          </div>
        </div>
      </div>
    );
  }

  const { grid, zoneGrid, minX, minY, width, maxX, maxY } = mapGrid;
  const height = grid.length;
  const baseCellSize = Math.max(2, Math.min(12, Math.floor(800 / Math.max(width, height))));
  const cellSize = Math.max(1, Math.round(baseCellSize * zoom));

  function getCellColor(cellType: string, zone: number): string {
    if (!showZones || zone === 0) {
      if (cellType === "1") return "#1646a0";
      if (cellType === "2") return "#0d7a52";
      return "#0a0e17";
    }
    if (cellType === "1") return ZONE_SEA_COLORS[zone] ?? "#0f1a2e";
    if (cellType === "2") return ZONE_SAND_COLORS[zone] ?? "#b8860b";
    return "#0a0e17";
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-start gap-5">
        {/* Map */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
                  style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.15)" }}>🗺</span>
                Carte du monde
              </h2>
              <p className="text-xs text-zinc-600 mt-1 ml-10.5">
                {width} x {height} — X[{minX},{maxX}] Y[{minY},{maxY}]
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Zone toggle */}
              <button type="button" onClick={() => setShowZones(z => !z)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${showZones ? "text-cyan-400" : "text-zinc-500"}`}
                style={{ background: showZones ? "rgba(0,229,255,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${showZones ? "rgba(0,229,255,0.2)" : "rgba(255,255,255,0.06)"}` }}>
                Zones
              </button>
              {/* Zoom */}
              <div className="flex items-center gap-1 rounded-xl px-1" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <button type="button" onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} disabled={zoom <= 0.3}
                  className="w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-zinc-200 disabled:opacity-30 text-sm font-bold">−</button>
                <span className="text-[10px] text-zinc-500 font-mono w-9 text-center">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => setZoom(z => Math.min(3, z + 0.2))} disabled={zoom >= 3}
                  className="w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-zinc-200 disabled:opacity-30 text-sm font-bold">+</button>
              </div>
              <button type="button" onClick={onRefresh} className="px-4 py-2 rounded-xl text-xs font-medium btn-primary">Actualiser</button>
            </div>
          </div>

          <div className="card overflow-hidden">
            {/* Hover info */}
            <div className="px-4 py-2 flex items-center justify-between text-xs" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", minHeight: 36 }}>
              {hoveredCell ? (
                <>
                  <span className="text-zinc-400">
                    <span className="font-mono text-cyan-400">({hoveredCell.x}, {hoveredCell.y})</span>
                    <span className="text-zinc-600 ml-2">{CELL_LABELS[hoveredCell.type] ?? "?"}</span>
                    {hoveredCell.zone > 0 && <span className="ml-2" style={{ color: ZONE_SAND_COLORS[hoveredCell.zone] }}>Zone {hoveredCell.zone}</span>}
                  </span>
                </>
              ) : (
                <span className="text-zinc-600">Survolez la carte</span>
              )}
              {shipPosition && (
                <span className="text-zinc-500 font-mono">
                  Bateau <span className="text-red-400">({shipPosition.x}, {shipPosition.y})</span>
                </span>
              )}
            </div>

            {/* Grid */}
            <div className="p-4 overflow-auto" style={{ background: "rgba(0,0,0,0.2)" }}>
              <div className="mx-auto" style={{
                display: "grid",
                gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
                gap: cellSize > 4 ? "1px" : "0px",
                width: "fit-content",
              }}>
                {grid.map((row, rowIdx) => {
                  const y = minY + rowIdx;
                  const zRow = zoneGrid?.[rowIdx];
                  return Array.from(row).map((cell, colIdx) => {
                    const x = minX + colIdx;
                    const zone = zRow ? Number(zRow[colIdx]) || 0 : 0;
                    const isShip = shipPosition && shipPosition.x === x && shipPosition.y === y;

                    return (
                      <div
                        key={`${x},${y}`}
                        onMouseEnter={() => setHoveredCell({ x, y, type: cell, zone })}
                        onMouseLeave={() => setHoveredCell(null)}
                        style={{
                          width: cellSize,
                          height: cellSize,
                          background: isShip ? "#ef4444" : getCellColor(cell, zone),
                          boxShadow: isShip
                            ? "0 0 8px rgba(239,68,68,0.9), 0 0 3px rgba(239,68,68,1)"
                            : cell === "2" ? `inset 0 0 2px ${showZones && zone > 0 ? ZONE_SAND_COLORS[zone] + "66" : "rgba(52,211,153,0.3)"}` : undefined,
                          borderRadius: isShip ? "2px" : cell === "2" ? "1px" : undefined,
                          cursor: "crosshair",
                        }}
                      />
                    );
                  });
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div className="lg:w-64 xl:w-72 shrink-0 space-y-4">
          {/* Zone legend */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Zones</h3>
            <div className="space-y-2">
              {Object.entries(ZONE_LABELS).map(([zoneId, info]) => {
                const count = stats?.zoneCounts[Number(zoneId)] ?? 0;
                return (
                  <div key={zoneId} className="flex items-center gap-3">
                    <div className="flex gap-1 shrink-0">
                      <span className="w-3 h-3 rounded-sm" style={{ background: info.seaColor, boxShadow: `0 0 4px ${info.seaColor}` }} />
                      <span className="w-3 h-3 rounded-sm" style={{ background: info.sandColor, boxShadow: `0 0 4px ${info.sandColor}` }} />
                    </div>
                    <span className="text-sm text-zinc-300 flex-1">{info.name}</span>
                    <span className="text-[10px] text-zinc-600 font-mono">{count > 0 ? count.toLocaleString() : "-"}</span>
                  </div>
                );
              })}
            </div>
            <div className="divider my-3" />
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: "#0a0e17", border: "1px solid rgba(255,255,255,0.1)" }} />
                <span className="text-sm text-zinc-300 flex-1">Inexplore</span>
                <span className="text-[10px] text-zinc-600 font-mono">{(stats?.unknown ?? 0).toLocaleString()}</span>
              </div>
              {shipPosition && (
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: "#ef4444", boxShadow: "0 0 6px rgba(239,68,68,0.6)" }} />
                  <span className="text-sm text-zinc-300 flex-1">Bateau</span>
                </div>
              )}
            </div>
          </div>

          {/* Exploration stats */}
          {stats && (
            <div className="card card-accent-cyan p-4">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Exploration</h3>
              <div className="text-center mb-4">
                <div className="text-4xl font-black font-mono" style={{ color: "#00e5ff", textShadow: "0 0 20px rgba(0,229,255,0.3)" }}>
                  {stats.exploredPct}%
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">de la carte exploree</div>
              </div>
              <div className="energy-gauge mb-4" style={{ height: 8 }}>
                <div className="energy-gauge-fill bg-cyan-500 progress-scan" style={{ width: `${stats.exploredPct}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="stat-pill">
                  <div className="text-[10px] text-zinc-500">Total</div>
                  <div className="text-sm font-bold text-white font-mono">{stats.total.toLocaleString()}</div>
                </div>
                <div className="stat-pill">
                  <div className="text-[10px] text-zinc-500">Explore</div>
                  <div className="text-sm font-bold font-mono" style={{ color: "#00e5ff" }}>{stats.explored.toLocaleString()}</div>
                </div>
                <div className="stat-pill">
                  <div className="text-[10px] text-zinc-500">Iles</div>
                  <div className="text-sm font-bold text-emerald-400 font-mono">{stats.known}</div>
                </div>
                <div className="stat-pill">
                  <div className="text-[10px] text-zinc-500">Inconnu</div>
                  <div className="text-sm font-bold text-zinc-500 font-mono">{stats.unknown.toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
