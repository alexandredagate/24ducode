"use client";

import { useState } from "react";
import type { Direction, ShipNextLevel, PlayerDetails } from "../hooks/useSocket";

interface ShipPanelProps {
  shipNextLevel: ShipNextLevel | null;
  shipExists: boolean;
  shipLevelError: string | null;
  currentPosition: { x: number; y: number; type: string; zone: number } | null;
  availableMove: number | null;
  playerResources: PlayerDetails["resources"] | null;
  onMove: (direction: Direction) => Promise<unknown>;
  onBuild: () => Promise<unknown>;
  onUpgrade: () => Promise<unknown>;
}

type DirectionKey = Direction | null;

const PAD: DirectionKey[][] = [
  ["NW", "N", "NE"],
  ["W",  null, "E"],
  ["SW", "S", "SE"],
];

const DIR_LABELS: Record<Direction, string> = {
  NW: "↖", N: "↑", NE: "↗",
  W: "←",          E: "→",
  SW: "↙", S: "↓", SE: "↘",
};

const RESOURCE_COLORS: Record<string, string> = {
  FERONIUM: "text-cyan-400",
  BOISIUM: "text-emerald-400",
  CHARBONIUM: "text-orange-400",
};

export function ShipPanel({
  shipNextLevel,
  shipExists,
  shipLevelError,
  currentPosition,
  availableMove,
  playerResources,
  onMove,
  onBuild,
  onUpgrade,
}: ShipPanelProps) {
  const [moving, setMoving] = useState<Direction | null>(null);
  const [moveResult, setMoveResult] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeResult, setUpgradeResult] = useState<string | null>(null);

  async function handleMove(dir: Direction) {
    setMoving(dir);
    setMoveResult(null);
    try {
      const res = await onMove(dir);
      const data = res as { energy: number; position: { x: number; y: number } } | null;
      if (data) {
        setMoveResult(`→ (${data.position.x}, ${data.position.y}) | Énergie: ${data.energy}`);
      }
    } catch (err) {
      setMoveResult(`Erreur: ${err instanceof Error ? err.message : "inconnue"}`);
    } finally {
      setMoving(null);
    }
  }

  async function handleUpgrade() {
    setUpgrading(true);
    setUpgradeResult(null);
    try {
      await onUpgrade();
      setUpgradeResult("Bateau amélioré avec succès !");
    } catch (err) {
      setUpgradeResult(`Erreur: ${err instanceof Error ? err.message : "inconnue"}`);
    } finally {
      setUpgrading(false);
    }
  }

  if (!shipExists) {
    return (
      <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-6 space-y-4">
        <h2 className="text-lg font-bold text-white">Bateau</h2>
        <p className="text-zinc-400 text-sm">Aucun bateau construit.</p>
        <button
          type="button"
          onClick={() => onBuild()}
          className="px-4 py-2 rounded-lg bg-white text-zinc-950 font-semibold text-sm hover:bg-zinc-200 transition-colors"
        >
          Construire le bateau
        </button>
      </div>
    );
  }

  const currentLevelId = shipNextLevel?.level ? shipNextLevel.level.id - 1 : null;

  // Calcul des ressources manquantes pour l'upgrade
  const resourceMap = new Map(playerResources?.map((r) => [r.type, r.quantity]) ?? []);
  const costEntries = shipNextLevel?.costResources
    ? (Object.entries(shipNextLevel.costResources) as [string, number][])
    : [];
  const canUpgrade = costEntries.length > 0 && costEntries.every(([res, cost]) => (resourceMap.get(res) ?? 0) >= cost);

  return (
    <div className="space-y-4">
      {/* État actuel */}
      <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Bateau</h2>
          {currentLevelId != null ? (
            <span className="px-2.5 py-1 rounded-full bg-zinc-700 text-zinc-300 text-xs font-semibold">
              Niveau {currentLevelId}
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-yellow-900 text-yellow-300 text-xs font-semibold">
              Niveau max
            </span>
          )}
        </div>

        {/* Position */}
        {currentPosition ? (
          <div className="flex items-center gap-3 mb-4">
            <div className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 font-mono">
              ({currentPosition.x}, {currentPosition.y})
            </div>
            <div className="text-xs text-zinc-500">
              {currentPosition.type} · zone {currentPosition.zone}
            </div>
          </div>
        ) : (
          <div className="mb-4 px-3 py-2 rounded-lg bg-zinc-900 text-zinc-500 text-xs">
            Position inconnue — effectuez un déplacement
          </div>
        )}

        {/* Énergie */}
        {availableMove != null ? (
          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
              <span>Énergie (mouvements restants)</span>
              <span className={availableMove <= 5 ? "text-red-400 font-bold" : "text-zinc-300"}>
                {availableMove}
              </span>
            </div>
            <div className="h-2 rounded-full bg-zinc-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  availableMove === 0 ? "bg-red-500"
                  : availableMove <= 5 ? "bg-yellow-400"
                  : "bg-emerald-400"
                }`}
                style={{ width: availableMove === 0 ? "2px" : `${Math.min((availableMove / 100) * 100, 100)}%` }}
              />
            </div>
            {availableMove === 0 && <p className="text-red-400 text-xs mt-1">⚠ Énergie épuisée — bateau immobilisé !</p>}
            {availableMove > 0 && availableMove <= 5 && <p className="text-yellow-400 text-xs mt-1">⚠ Énergie critique — rentrez au port !</p>}
          </div>
        ) : (
          <div className="text-xs text-zinc-500">Énergie inconnue — effectuez un déplacement</div>
        )}
      </div>

      {/* Pad directionnel */}
      <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-5">
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">Déplacer le bateau</h3>
        <div className="flex flex-col items-center gap-1">
          {PAD.map((row, ri) => (
            <div key={`row-${PAD[ri]?.join("")}`} className="flex gap-1">
              {row.map((dir) =>
                dir === null ? (
                  <div key="center" className="w-12 h-12 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-zinc-600" />
                  </div>
                ) : (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => handleMove(dir)}
                    disabled={moving !== null || availableMove === 0 || availableMove == null}
                    className={`w-12 h-12 rounded-lg text-lg font-bold transition-all ${
                      moving === dir
                        ? "bg-blue-500 text-white scale-95"
                        : "bg-zinc-700 hover:bg-zinc-600 text-zinc-200 active:scale-95"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {DIR_LABELS[dir]}
                  </button>
                )
              )}
            </div>
          ))}
        </div>
        {moveResult && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-zinc-900 text-zinc-300 text-xs font-mono">
            {moveResult}
          </div>
        )}
      </div>

      {/* Prochain niveau */}
      {shipNextLevel?.level ? (
        <div className="rounded-xl bg-zinc-800 border border-zinc-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-700">
            <h3 className="text-sm font-semibold text-zinc-200">
              Prochain niveau —{" "}
              <span className="capitalize text-white">{shipNextLevel.level!.name}</span>{" "}
              <span className="text-zinc-500 font-normal">(niv. {shipNextLevel.level!.id})</span>
            </h3>
          </div>
          <div className="p-5 space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-lg bg-zinc-900 px-2 sm:px-3 py-2.5 text-center">
                <div className="text-xs text-zinc-500 mb-0.5">Mouv. max</div>
                <div className="text-lg font-bold text-white">{shipNextLevel.level!.maxMovement}</div>
              </div>
              <div className="rounded-lg bg-zinc-900 px-2 sm:px-3 py-2.5 text-center">
                <div className="text-xs text-zinc-500 mb-0.5">Visibilité</div>
                <div className="text-lg font-bold text-white">{shipNextLevel.level!.visibilityRange}</div>
              </div>
              <div className="rounded-lg bg-zinc-900 px-2 sm:px-3 py-2.5 text-center">
                <div className="text-xs text-zinc-500 mb-0.5">Vitesse</div>
                <div className="text-lg font-bold text-white">{shipNextLevel.level!.speed}</div>
              </div>
            </div>

            {/* Coût et ressources actuelles */}
            {costEntries.length > 0 && (
              <div>
                <div className="text-xs text-zinc-500 mb-2">Ressources requises</div>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  {costEntries.map(([resource, cost]) => {
                    const have = resourceMap.get(resource) ?? 0;
                    const missing = Math.max(0, cost - have);
                    const enough = have >= cost;

                    return (
                      <div
                        key={resource}
                        className={`rounded-lg border px-2 sm:px-3 py-2 text-center ${
                          enough
                            ? "bg-emerald-950 border-emerald-800"
                            : "bg-red-950 border-red-800"
                        }`}
                      >
                        <div className={`text-xs font-semibold ${RESOURCE_COLORS[resource] ?? "text-zinc-400"}`}>
                          {resource}
                        </div>
                        <div className="text-sm font-bold text-white mt-0.5">
                          {have.toLocaleString()} / {cost.toLocaleString()}
                        </div>
                        {!enough && (
                          <div className="text-xs text-red-400 mt-0.5">
                            -{missing.toLocaleString()}
                          </div>
                        )}
                        {enough && (
                          <div className="text-xs text-emerald-400 mt-0.5">OK</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {!canUpgrade && (
                  <div className="mt-2 text-xs text-red-400">
                    Ressources insuffisantes pour cette amélioration
                  </div>
                )}
              </div>
            )}

            {/* Bouton upgrade */}
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={upgrading || !canUpgrade}
              className="w-full py-2.5 rounded-lg bg-white text-zinc-950 font-semibold text-sm hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {upgrading ? "Amélioration en cours..." : canUpgrade ? `Améliorer → ${shipNextLevel.level!.name}` : "Ressources insuffisantes"}
            </button>

            {upgradeResult && (
              <div className={`px-3 py-2 rounded-lg text-xs ${
                upgradeResult.startsWith("Erreur")
                  ? "bg-red-950 border border-red-800 text-red-300"
                  : "bg-emerald-950 border border-emerald-800 text-emerald-300"
              }`}>
                {upgradeResult}
              </div>
            )}
          </div>
        </div>
      ) : shipLevelError ? (
        <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-4">
          <h3 className="text-sm font-semibold text-zinc-200 mb-2">Prochain niveau</h3>
          <div className="px-3 py-2 rounded-lg bg-amber-950 border border-amber-800 text-amber-300 text-xs font-mono">
            {shipLevelError}
          </div>
        </div>
      ) : shipNextLevel && !shipNextLevel.level ? (
        <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-4 text-center">
          <div className="text-yellow-400 text-lg mb-1">★</div>
          <p className="text-zinc-400 text-sm">Niveau maximum atteint</p>
        </div>
      ) : (
        <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-4 text-center">
          <p className="text-zinc-500 text-sm">Chargement des données du prochain niveau...</p>
        </div>
      )}
    </div>
  );
}
