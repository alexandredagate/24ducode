"use client";

import type { PlayerDetails, StorageInfo } from "../hooks/useSocket";

const RESOURCE_COLORS: Record<string, string> = {
  FERONIUM: "text-cyan-400",
  BOISIUM: "text-emerald-400",
  CHARBONIUM: "text-orange-400",
};

const RESOURCE_GLOW: Record<string, string> = {
  FERONIUM: "glow-cyan border-glow-cyan",
  BOISIUM: "glow-emerald border-glow-emerald",
  CHARBONIUM: "glow-orange border-glow-orange",
};

interface PlayerCardProps {
  player: PlayerDetails;
  storage: StorageInfo | null;
  onUpgradeStorage: () => Promise<void>;
}

export function PlayerCard({ player, storage, onUpgradeStorage }: PlayerCardProps) {
  const knownIslands = player.discoveredIslands.filter((i) => i.islandState === "KNOWN");

  const resourceMap = storage ? new Map<string, number>(player.resources.map((r) => [r.type, r.quantity])) : null;
  const costEntries = storage ? (Object.entries(storage.costResources) as [string, number][]) : [];
  const canUpgrade = costEntries.length > 0 && costEntries.every(([res, cost]) => (resourceMap?.get(res) ?? 0) >= cost);

  return (
    <>
      {/* En-tête joueur */}
      <div className="rounded-xl glass glow-cyan card-3d p-5 hud-corner xl:order-1">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-white section-header">{player.name}</h2>
            <p className="text-zinc-400 text-sm mt-0.5 pl-3">Île : {player.home.name}</p>
          </div>
          <div className="sm:text-right">
            <div className="text-2xl font-bold text-yellow-400 animate-glow-pulse">{player.money.toLocaleString()} OR</div>
            <div className="text-zinc-400 text-xs mt-0.5">Quotient de productivité : {player.quotient}</div>
          </div>
        </div>
        {player.marketPlaceDiscovered && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-purple-950/50 border border-purple-800/50 text-purple-300 text-xs glow-purple">
            <span>&#9889;</span> Marketplace débloquée
          </div>
        )}
      </div>

      {/* Ressources */}
      <div className="rounded-xl glass card-3d p-4 xl:order-2">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3 section-header">Ressources</h3>
        <div className="space-y-2">
          {player.resources.map((r) => (
            <div
              key={r.type}
              className={`rounded-lg border px-3 py-2 flex items-center justify-between ${RESOURCE_GLOW[r.type] ?? ""}`}
            >
              <span className={`text-xs font-semibold uppercase tracking-wide ${RESOURCE_COLORS[r.type] ?? "text-zinc-300"}`}>
                {r.type}
              </span>
              <span className="text-lg font-bold text-white font-mono">{r.quantity.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Upgrade entrepôt */}
      <div className="rounded-xl glass overflow-hidden card-3d xl:order-5">
        {storage && resourceMap ? (
          <>
            <div className="px-4 py-3 border-b border-white/5">
              <div className="text-sm font-semibold text-zinc-200 section-header">Entrepôt : {storage.name}</div>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-1.5">
                {costEntries.map(([resource, cost]) => {
                  const have = resourceMap.get(resource) ?? 0;
                  const missing = Math.max(0, cost - have);
                  const enough = have >= cost;

                  return (
                    <div
                      key={resource}
                      className={`rounded-lg border px-2 py-2 text-center ${
                        enough
                          ? "bg-emerald-950/30 border-emerald-800/50 glow-emerald"
                          : "bg-red-950/30 border-red-800/50 glow-red"
                      }`}
                    >
                      <div className={`text-xs font-semibold ${RESOURCE_COLORS[resource] ?? "text-zinc-400"}`}>
                        {resource}
                      </div>
                      <div className="text-sm font-bold text-white mt-0.5 font-mono">
                        {have.toLocaleString()} / {cost.toLocaleString()}
                      </div>
                      {!enough && (
                        <div className="text-xs text-red-400 mt-0.5">-{missing.toLocaleString()}</div>
                      )}
                      {enough && (
                        <div className="text-xs text-emerald-400 mt-0.5">OK</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={onUpgradeStorage}
                disabled={!canUpgrade}
                className="w-full px-4 py-2 rounded-lg text-sm btn-gaming-emerald"
              >
                {canUpgrade ? "Améliorer" : "Ressources insuffisantes"}
              </button>
            </div>
          </>
        ) : (
          <div className="p-4 text-center">
            <div className="text-sm font-semibold text-zinc-200 section-header mb-2">Entrepôt</div>
            <p className="text-zinc-500 text-xs">Chargement...</p>
          </div>
        )}
      </div>

      {/* Îles découvertes */}
      <div className="rounded-xl glass p-4 card-3d xl:order-8">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3 section-header">
          Îles découvertes ({knownIslands.length} / {player.discoveredIslands.length})
        </h3>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {player.discoveredIslands.map((di, i) => (
            <div
              key={`${di.island.name}-${i}`}
              className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-black/20 border border-white/5"
            >
              <span className="text-sm text-zinc-200">{di.island.name}</span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  di.islandState === "KNOWN"
                    ? "bg-emerald-950/50 text-emerald-400 border border-emerald-800/50"
                    : "bg-yellow-950/50 text-yellow-400 border border-yellow-800/50"
                }`}
              >
                {di.islandState}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
