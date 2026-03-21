"use client";

import type { PlayerDetails, StorageInfo } from "../hooks/useSocket";

const RESOURCE_COLORS: Record<string, string> = {
  FERONIUM: "text-cyan-400",
  BOISIUM: "text-emerald-400",
  CHARBONIUM: "text-orange-400",
};

const RESOURCE_BG: Record<string, string> = {
  FERONIUM: "bg-cyan-950 border-cyan-800",
  BOISIUM: "bg-emerald-950 border-emerald-800",
  CHARBONIUM: "bg-orange-950 border-orange-800",
};

interface PlayerCardProps {
  player: PlayerDetails;
  storage: StorageInfo | null;
  onUpgradeStorage: () => Promise<void>;
}

export function PlayerCard({ player, storage, onUpgradeStorage }: PlayerCardProps) {
  const knownIslands = player.discoveredIslands.filter((i) => i.islandState === "KNOWN");

  return (
    <div className="space-y-4">
      {/* En-tête joueur */}
      <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-white">{player.name}</h2>
            <p className="text-zinc-400 text-sm mt-0.5">Île : {player.home.name}</p>
          </div>
          <div className="sm:text-right">
            <div className="text-2xl font-bold text-yellow-400">{player.money.toLocaleString()} OR</div>
            <div className="text-zinc-400 text-xs mt-0.5">Quotient de productivité : {player.quotient}</div>
          </div>
        </div>
        {player.marketPlaceDiscovered && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-purple-950 border border-purple-800 text-purple-300 text-xs">
            <span>⚡</span> Marketplace débloquée
          </div>
        )}
      </div>

      {/* Ressources */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {player.resources.map((r) => {
          const maxQty = storage?.maxResources[r.type as keyof typeof storage.maxResources];
          const pct = maxQty ? Math.round((r.quantity / maxQty) * 100) : null;
          return (
            <div
              key={r.type}
              className={`rounded-xl border p-4 ${RESOURCE_BG[r.type] ?? "bg-zinc-800 border-zinc-700"}`}
            >
              <div className={`text-xs font-semibold uppercase tracking-wide ${RESOURCE_COLORS[r.type] ?? "text-zinc-300"}`}>
                {r.type}
              </div>
              <div className="text-2xl font-bold text-white mt-1">{r.quantity.toLocaleString()}</div>
              {maxQty !== undefined && (
                <>
                  <div className="text-zinc-500 text-xs mt-0.5">/ {maxQty.toLocaleString()}</div>
                  <div className="mt-2 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        (pct ?? 0) > 80 ? "bg-red-500" : (pct ?? 0) > 50 ? "bg-yellow-400" : RESOURCE_COLORS[r.type]?.replace("text-", "bg-") ?? "bg-zinc-400"
                      }`}
                      style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Upgrade entrepôt */}
      {storage && (() => {
        const resourceMap = new Map(player.resources.map((r) => [r.type, r.quantity]));
        const costEntries = Object.entries(storage.costResources) as [string, number][];
        const canUpgrade = costEntries.every(([res, cost]) => (resourceMap.get(res) ?? 0) >= cost);

        return (
          <div className="rounded-xl bg-zinc-800 border border-zinc-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-700">
              <div className="text-sm font-semibold text-zinc-200">Entrepôt prochain niveau : {storage.name}</div>
            </div>
            <div className="p-4 space-y-3">
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
                        <div className="text-xs text-red-400 mt-0.5">-{missing.toLocaleString()}</div>
                      )}
                      {enough && (
                        <div className="text-xs text-emerald-400 mt-0.5">OK</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {!canUpgrade && (
                <div className="text-xs text-red-400">Ressources insuffisantes pour cette amélioration</div>
              )}
              <button
                type="button"
                onClick={onUpgradeStorage}
                disabled={!canUpgrade}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {canUpgrade ? "Améliorer" : "Ressources insuffisantes"}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Îles découvertes */}
      <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">
          Îles découvertes ({knownIslands.length} / {player.discoveredIslands.length})
        </h3>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {player.discoveredIslands.map((di, i) => (
            <div
              key={`${di.island.name}-${i}`}
              className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-900"
            >
              <span className="text-sm text-zinc-200">{di.island.name}</span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  di.islandState === "KNOWN"
                    ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                    : "bg-yellow-950 text-yellow-400 border border-yellow-800"
                }`}
              >
                {di.islandState}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
