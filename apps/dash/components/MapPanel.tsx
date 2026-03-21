"use client";

import type { MapGrid } from "../hooks/useSocket";

interface MapPanelProps {
  mapGrid: MapGrid | null;
  shipPosition: { x: number; y: number } | null;
  onRefresh: () => void;
}

const CELL_COLORS: Record<string, string> = {
  "0": "bg-zinc-800", // inconnu
  "1": "bg-blue-600", // eau
  "2": "bg-emerald-500", // sable KNOWN
  "3": "bg-yellow-400", // sable DISCOVERED
};

export function MapPanel({ mapGrid, shipPosition, onRefresh }: MapPanelProps) {
  if (!mapGrid) {
    return (
      <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-8 text-center">
        <p className="text-zinc-400 text-sm">Chargement de la carte...</p>
      </div>
    );
  }

  const { grid, minX, minY, width } = mapGrid;

  // Calculer la taille des cellules en fonction de la largeur de la grille
  // On veut que ça rentre dans l'écran
  const maxCellSize = Math.max(2, Math.min(12, Math.floor(600 / width)));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-white">Carte</h2>
          <p className="text-xs text-zinc-500">
            {width} × {grid.length} · X [{minX}, {mapGrid.maxX}] · Y [{minY}, {mapGrid.maxY}]
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-blue-600" /> Eau</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" /> Île connue</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-yellow-400" /> Île découverte</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-zinc-800 border border-zinc-700" /> Inconnu</span>
            {shipPosition && (
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> Bateau</span>
            )}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="shrink-0 text-xs text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-1 rounded bg-zinc-800"
          >
            Actualiser
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-4 overflow-auto">
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
                  className={`${isShip ? "bg-red-500" : CELL_COLORS[cell] ?? "bg-zinc-800"}`}
                  style={{
                    width: maxCellSize,
                    height: maxCellSize,
                  }}
                  title={`(${x}, ${y}) ${cell === "0" ? "Inconnu" : cell === "1" ? "Eau" : cell === "2" ? "Île connue" : "Île découverte"}${isShip ? " — Bateau" : ""}`}
                />
              );
            });
          })}
        </div>
      </div>

      {shipPosition && (
        <div className="text-xs text-zinc-500 text-center">
          Position du bateau : ({shipPosition.x}, {shipPosition.y})
        </div>
      )}
    </div>
  );
}
