"use client";

import type { MapGrid } from "../hooks/useSocket";

interface MapPanelProps {
  mapGrid: MapGrid | null;
  shipPosition: { x: number; y: number } | null;
  onRefresh: () => void;
}

const CELL_COLORS: Record<string, string> = {
  "0": "bg-zinc-900",
  "1": "bg-blue-600",
  "2": "bg-emerald-500",
  "3": "bg-yellow-400",
};

export function MapPanel({ mapGrid, shipPosition, onRefresh }: MapPanelProps) {
  if (!mapGrid) {
    return (
      <div className="rounded-xl glass p-8 text-center">
        <p className="text-zinc-400 text-sm">Chargement de la carte...</p>
      </div>
    );
  }

  const { grid, minX, minY, width } = mapGrid;

  const maxCellSize = Math.max(2, Math.min(12, Math.floor(600 / width)));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-white section-header">Carte</h2>
          <p className="text-xs text-zinc-500 pl-3">
            {width} × {grid.length} · X [{minX}, {mapGrid.maxX}] · Y [{minY}, {mapGrid.maxY}]
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-blue-600" style={{ boxShadow: "0 0 4px rgba(37,99,235,0.5)" }} /> Eau</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" style={{ boxShadow: "0 0 4px rgba(16,185,129,0.5)" }} /> Île connue</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-yellow-400" style={{ boxShadow: "0 0 4px rgba(250,204,21,0.5)" }} /> Île découverte</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-zinc-900 border border-zinc-700" /> Inconnu</span>
            {shipPosition && (
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" style={{ boxShadow: "0 0 6px rgba(239,68,68,0.6)" }} /> Bateau</span>
            )}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg glass hover:border-glow-cyan text-zinc-400 hover:text-zinc-200 transition-all"
          >
            Actualiser
          </button>
        </div>
      </div>

      <div className="rounded-xl glass p-4 overflow-auto glow-cyan">
        <div
          className="mx-auto"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${width}, ${maxCellSize}px)`,
            gap: "1px",
            width: "fit-content",
          }}
        >
          {grid.map((row, rowIdx) => {
            const y = minY + rowIdx;
            return Array.from(row).map((cell, colIdx) => {
              const x = minX + colIdx;
              const isShip = shipPosition && shipPosition.x === x && shipPosition.y === y;

              return (
                <div
                  key={`${x},${y}`}
                  className={`${isShip ? "bg-red-500" : CELL_COLORS[cell] ?? "bg-zinc-900"}`}
                  style={{
                    width: maxCellSize,
                    height: maxCellSize,
                    boxShadow: isShip ? "0 0 6px rgba(239,68,68,0.8)" : undefined,
                  }}
                  title={`(${x}, ${y}) ${cell === "0" ? "Inconnu" : cell === "1" ? "Eau" : cell === "2" ? "Île connue" : "Île découverte"}${isShip ? " — Bateau" : ""}`}
                />
              );
            });
          })}
        </div>
      </div>

      {shipPosition && (
        <div className="text-xs text-zinc-500 text-center font-mono">
          Position du bateau : ({shipPosition.x}, {shipPosition.y})
        </div>
      )}
    </div>
  );
}
