"use client";

import { useState } from "react";
import type { ShipNextLevel, PlayerDetails, CapitainStatus } from "../hooks/useSocket";

interface ShipPanelProps {
  shipNextLevel: ShipNextLevel | null;
  shipExists: boolean;
  shipLevelError: string | null;
  currentPosition: { x: number; y: number; type: string; zone: number } | null;
  availableMove: number | null;
  playerResources: PlayerDetails["resources"] | null;
  onBuild: () => Promise<unknown>;
  onUpgrade: () => Promise<unknown>;
  onGoTo: (x: number, y: number) => Promise<unknown>;
  capitainStatus: CapitainStatus | null;
}

const RESOURCE_META: Record<string, { color: string; label: string }> = {
  FERONIUM: { color: "text-cyan-400", label: "Feronium" },
  BOISIUM: { color: "text-emerald-400", label: "Boisium" },
  CHARBONIUM: { color: "text-orange-400", label: "Charbonium" },
};

export function ShipPanel({
  shipNextLevel,
  shipExists,
  shipLevelError,
  currentPosition,
  availableMove,
  playerResources,
  onBuild,
  onUpgrade,
  onGoTo,
  capitainStatus,
}: ShipPanelProps) {
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeResult, setUpgradeResult] = useState<string | null>(null);
  const [goToX, setGoToX] = useState("");
  const [goToY, setGoToY] = useState("");
  const [goToSending, setGoToSending] = useState(false);
  const [goToResult, setGoToResult] = useState<string | null>(null);

  async function handleUpgrade() {
    setUpgrading(true);
    setUpgradeResult(null);
    try {
      await onUpgrade();
      setUpgradeResult("Bateau ameliore !");
    } catch (err) {
      setUpgradeResult(`Erreur: ${err instanceof Error ? err.message : "inconnue"}`);
    } finally {
      setUpgrading(false);
    }
  }

  if (!shipExists) {
    return (
      <div className="card card-accent-blue p-6 space-y-4">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-40">⛵</div>
          <h2 className="text-base font-bold text-white mb-1">Aucun bateau</h2>
          <p className="text-zinc-500 text-sm mb-4">Construisez votre premier navire pour partir en mer.</p>
          <button
            type="button"
            onClick={() => onBuild()}
            className="px-5 py-2.5 rounded-xl text-sm btn-gaming"
          >
            Construire le bateau
          </button>
        </div>
      </div>
    );
  }

  const currentLevelId = shipNextLevel?.level ? shipNextLevel.level.id - 1 : null;
  const resourceMap = new Map<string, number>(playerResources?.map((r) => [r.type, r.quantity]) ?? []);
  const costEntries = shipNextLevel?.costResources
    ? (Object.entries(shipNextLevel.costResources) as [string, number][])
    : [];
  const canUpgrade = costEntries.length > 0 && costEntries.every(([res, cost]) => (resourceMap.get(res) ?? 0) >= cost);

  const energyPct = availableMove != null ? Math.min(100, (availableMove / 100) * 100) : 0;
  const energyColor = availableMove === 0 ? "bg-red-500" : (availableMove ?? 0) <= 5 ? "bg-yellow-400" : "bg-cyan-400";

  return (
    <>
      {/* Current state */}
      <div className="card card-accent-blue p-5 xl:order-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="opacity-50">⛵</span> Bateau
          </h2>
          {currentLevelId != null ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}>
              Niv. {currentLevelId}
            </span>
          ) : (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", color: "#fbbf24" }}>
              MAX
            </span>
          )}
        </div>

        {/* Position */}
        {currentPosition ? (
          <div className="flex items-center gap-3 mb-4">
            <div className="px-3 py-1.5 rounded-lg text-sm font-mono font-bold"
              style={{ background: "rgba(0,229,255,0.06)", border: "1px solid rgba(0,229,255,0.12)", color: "#00e5ff", textShadow: "0 0 6px rgba(0,229,255,0.2)" }}>
              ({currentPosition.x}, {currentPosition.y})
            </div>
            <div className="text-xs text-zinc-600">
              {currentPosition.type} · Z{currentPosition.zone}
            </div>
          </div>
        ) : (
          <div className="mb-4 px-3 py-2 rounded-lg text-zinc-600 text-xs" style={{ background: "rgba(0,0,0,0.15)" }}>
            Position inconnue
          </div>
        )}

        {/* Energy */}
        {availableMove != null ? (
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-zinc-500">Energie</span>
              <span className={`font-mono font-bold ${availableMove <= 5 ? "text-red-400" : "text-cyan-400"}`}>
                {availableMove}
              </span>
            </div>
            <div className="energy-gauge">
              <div
                className={`energy-gauge-fill progress-scan ${energyColor}`}
                style={{ width: availableMove === 0 ? "2px" : `${energyPct}%` }}
              />
            </div>
            {availableMove === 0 && <p className="text-red-400 text-[11px] mt-1.5">Energie epuisee !</p>}
            {availableMove > 0 && availableMove <= 5 && <p className="text-yellow-400 text-[11px] mt-1.5">Energie critique</p>}
          </div>
        ) : (
          <div className="text-xs text-zinc-600">Energie inconnue</div>
        )}
      </div>

      {/* Auto navigation */}
      <div className="card card-accent-blue p-5 xl:order-7">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Cap automatique</h3>
        <p className="text-[11px] text-zinc-600 mb-3">
          Ordonnez au capitaine de naviguer vers des coordonnees.
        </p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-[10px] text-zinc-500 mb-1 uppercase">X</label>
            <input
              type="number"
              value={goToX}
              onChange={(e) => setGoToX(e.target.value)}
              placeholder={currentPosition ? String(currentPosition.x) : "0"}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono input-gaming"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[10px] text-zinc-500 mb-1 uppercase">Y</label>
            <input
              type="number"
              value={goToY}
              onChange={(e) => setGoToY(e.target.value)}
              placeholder={currentPosition ? String(currentPosition.y) : "0"}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono input-gaming"
            />
          </div>
          <button
            type="button"
            disabled={goToSending || goToX === "" || goToY === ""}
            onClick={async () => {
              const x = Number(goToX);
              const y = Number(goToY);
              if (Number.isNaN(x) || Number.isNaN(y)) {
                setGoToResult("Coordonnees invalides");
                return;
              }
              setGoToSending(true);
              setGoToResult(null);
              try {
                await onGoTo(x, y);
                setGoToResult(`Cap vers (${x}, ${y})`);
              } catch (err) {
                setGoToResult(`Erreur: ${err instanceof Error ? err.message : "inconnue"}`);
              } finally {
                setGoToSending(false);
              }
            }}
            className="px-4 py-2 rounded-lg text-sm font-semibold btn-primary whitespace-nowrap"
          >
            {goToSending ? "..." : "Go"}
          </button>
        </div>
        {goToResult && (
          <div className={`mt-2 px-3 py-2 rounded-lg text-xs font-mono toast ${
            goToResult.startsWith("Erreur") ? "text-red-400" : "text-cyan-400"
          }`} style={{
            background: goToResult.startsWith("Erreur") ? "rgba(239,68,68,0.06)" : "rgba(0,229,255,0.04)",
            border: `1px solid ${goToResult.startsWith("Erreur") ? "rgba(239,68,68,0.15)" : "rgba(0,229,255,0.1)"}`,
          }}>
            {goToResult}
          </div>
        )}

        {/* Capitain realtime status */}
        {capitainStatus && (
          <div className={`mt-3 rounded-xl p-3 ${
            capitainStatus.status === "IN_PROGRESS" ? "glow-blue" : ""
          }`} style={{
            background: capitainStatus.status === "COMPLETED" ? "rgba(52,211,153,0.06)" :
              capitainStatus.status === "FAILED" || capitainStatus.status === "CANCELLED" ? "rgba(239,68,68,0.06)" :
              capitainStatus.status === "IN_PROGRESS" ? "rgba(59,130,246,0.06)" : "rgba(255,255,255,0.02)",
            border: `1px solid ${
              capitainStatus.status === "COMPLETED" ? "rgba(52,211,153,0.15)" :
              capitainStatus.status === "FAILED" || capitainStatus.status === "CANCELLED" ? "rgba(239,68,68,0.15)" :
              capitainStatus.status === "IN_PROGRESS" ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.04)"
            }`,
          }}>
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs font-semibold flex items-center gap-1.5 ${
                capitainStatus.status === "COMPLETED" ? "text-emerald-400" :
                capitainStatus.status === "FAILED" || capitainStatus.status === "CANCELLED" ? "text-red-400" :
                capitainStatus.status === "IN_PROGRESS" ? "text-blue-400" :
                "text-zinc-400"
              }`}>
                {capitainStatus.status === "IN_PROGRESS" && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 live-dot" />}
                {capitainStatus.status === "PENDING" && "En attente..."}
                {capitainStatus.status === "IN_PROGRESS" && "En route"}
                {capitainStatus.status === "COMPLETED" && "Arrive"}
                {capitainStatus.status === "FAILED" && "Echec"}
                {capitainStatus.status === "CANCELLED" && "Annule"}
              </span>
              {capitainStatus.progress?.target && (
                <span className="text-[11px] text-zinc-500 font-mono">
                  ({capitainStatus.progress.target.x}, {capitainStatus.progress.target.y})
                </span>
              )}
            </div>
            {capitainStatus.message && (
              <p className="text-[11px] text-zinc-400">{capitainStatus.message}</p>
            )}
            {capitainStatus.progress && capitainStatus.status === "IN_PROGRESS" && (
              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                  <span>
                    {capitainStatus.progress.current && (
                      <>({capitainStatus.progress.current.x}, {capitainStatus.progress.current.y})</>
                    )}
                  </span>
                  <span className="font-mono">{capitainStatus.progress.stepsRemaining} restants</span>
                </div>
                <div className="energy-gauge">
                  <div
                    className="energy-gauge-fill bg-blue-500 progress-scan"
                    style={{
                      width: capitainStatus.progress.stepsTotal > 0
                        ? `${Math.max(2, ((capitainStatus.progress.stepsTotal - capitainStatus.progress.stepsRemaining) / capitainStatus.progress.stepsTotal) * 100)}%`
                        : "0%"
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Next level */}
      {shipNextLevel?.level ? (
        <div className="card card-accent-blue overflow-hidden xl:order-6">
          <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <h3 className="text-sm font-semibold text-zinc-200">
              {shipNextLevel.level!.name}
              <span className="text-zinc-600 font-normal ml-1.5 text-xs">niv. {shipNextLevel.level!.id}</span>
            </h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="stat-pill">
                <div className="text-[10px] text-zinc-500 mb-0.5">Mouv.</div>
                <div className="text-lg font-bold text-white font-mono">{shipNextLevel.level!.maxMovement}</div>
              </div>
              <div className="stat-pill">
                <div className="text-[10px] text-zinc-500 mb-0.5">Vision</div>
                <div className="text-lg font-bold text-white font-mono">{shipNextLevel.level!.visibilityRange}</div>
              </div>
              <div className="stat-pill">
                <div className="text-[10px] text-zinc-500 mb-0.5">Vitesse</div>
                <div className="text-lg font-bold text-white font-mono">{shipNextLevel.level!.speed}</div>
              </div>
            </div>

            {costEntries.length > 0 && (
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Cout</div>
                <div className="grid grid-cols-3 gap-2">
                  {costEntries.map(([resource, cost]) => {
                    const have = resourceMap.get(resource) ?? 0;
                    const missing = Math.max(0, cost - have);
                    const enough = have >= cost;
                    const pct = Math.min(100, (have / cost) * 100);
                    const meta = RESOURCE_META[resource];
                    return (
                      <div key={resource} className="stat-pill">
                        <div className={`text-[10px] font-semibold ${meta?.color ?? "text-zinc-400"}`}>{meta?.label ?? resource}</div>
                        <div className="text-xs font-bold text-white mt-0.5 font-mono">
                          {have.toLocaleString()}<span className="text-zinc-600">/{cost.toLocaleString()}</span>
                        </div>
                        <div className="w-full energy-gauge mt-1.5">
                          <div className={`energy-gauge-fill ${enough ? "bg-emerald-400" : "bg-red-400"}`} style={{ width: `${Math.max(2, pct)}%` }} />
                        </div>
                        {!enough && <div className="text-[10px] text-red-400 mt-0.5">-{missing.toLocaleString()}</div>}
                        {enough && <div className="text-[10px] text-emerald-400 mt-0.5">OK</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button type="button" onClick={handleUpgrade} disabled={upgrading || !canUpgrade}
              className="w-full py-2.5 rounded-xl text-sm btn-gaming-emerald">
              {upgrading ? "Amelioration..." : canUpgrade ? "Ameliorer" : "Ressources insuffisantes"}
            </button>

            {upgradeResult && (
              <div className={`px-3 py-2 rounded-lg text-xs font-mono toast ${upgradeResult.startsWith("Erreur") ? "text-red-400" : "text-emerald-400"}`}
                style={{ background: upgradeResult.startsWith("Erreur") ? "rgba(239,68,68,0.06)" : "rgba(52,211,153,0.06)", border: `1px solid ${upgradeResult.startsWith("Erreur") ? "rgba(239,68,68,0.15)" : "rgba(52,211,153,0.15)"}` }}>
                {upgradeResult}
              </div>
            )}
          </div>
        </div>
      ) : shipLevelError ? (
        <div className="card p-5 xl:order-6 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(251,191,36,0.08) 0%, transparent 70%)" }} />
          <div className="relative flex flex-col items-center justify-center text-center gap-3 h-full min-h-32">
            <div className="relative">
              <div className="absolute inset-0 rounded-full blur-md" style={{ background: "rgba(251,191,36,0.3)" }} />
              <div className="relative w-14 h-14 rounded-full flex items-center justify-center text-2xl" style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.2) 0%, rgba(245,158,11,0.1) 100%)", border: "1px solid rgba(251,191,36,0.35)" }}>
                👑
              </div>
            </div>
            <div>
              <p className="text-amber-300 font-semibold text-sm tracking-wide">Niveau Maximum</p>
              <p className="text-zinc-500 text-xs mt-0.5">Votre bateau a atteint son plein potentiel</p>
            </div>
            <div className="w-full flex items-center gap-2 mt-1">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex-1 h-1.5 rounded-full animate-pulse" style={{ background: "linear-gradient(90deg, rgba(251,191,36,0.7), rgba(245,158,11,0.4))", animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        </div>
      ) : shipNextLevel && !shipNextLevel.level ? (
        <div className="card p-5 text-center xl:order-6">
          <div className="text-yellow-400 text-2xl mb-2 animate-float">&#9733;</div>
          <p className="text-zinc-500 text-sm">Niveau maximum atteint</p>
        </div>
      ) : (
        <div className="card p-4 text-center xl:order-6">
          <p className="text-zinc-600 text-sm">Chargement...</p>
        </div>
      )}
    </>
  );
}
