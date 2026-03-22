"use client";

import type { PlayerDetails, StorageInfo } from "../hooks/useSocket";

const RESOURCE_META: Record<string, { color: string; dotClass: string; label: string }> = {
  FERONIUM: { color: "text-cyan-400", dotClass: "resource-dot-FERONIUM", label: "Feronium" },
  BOISIUM: { color: "text-emerald-400", dotClass: "resource-dot-BOISIUM", label: "Boisium" },
  CHARBONIUM: { color: "text-orange-400", dotClass: "resource-dot-CHARBONIUM", label: "Charbonium" },
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
      {/* Player header */}
      <div className="card card-accent-cyan p-5 xl:order-1">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
              style={{
                background: "linear-gradient(135deg, rgba(0,229,255,0.1), rgba(59,130,246,0.08))",
                border: "1px solid rgba(0,229,255,0.15)",
              }}
            >
              ⚓
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">{player.name}</h2>
              <p className="text-zinc-500 text-xs">{player.home.name}</p>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs text-zinc-500 mb-0.5">Tresor</div>
            <div className="text-2xl font-bold text-yellow-400 font-mono animate-glow-pulse">{player.money.toLocaleString()}</div>
            <div className="text-[10px] text-zinc-600">pieces d'or</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-zinc-500">Quotient</div>
            <div className="text-lg font-bold text-white font-mono">{player.quotient}</div>
          </div>
        </div>

        {player.marketPlaceDiscovered && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
            style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)", color: "#c084fc" }}>
            Marketplace active
          </div>
        )}
      </div>

      {/* Resources */}
      <div className="card card-accent-emerald p-5 xl:order-2">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Ressources</h3>
        <div className="space-y-2.5">
          {player.resources.map((r) => {
            const meta = RESOURCE_META[r.type];
            return (
              <div key={r.type} className="flex items-center gap-3">
                <span className={meta?.dotClass ?? "resource-dot"} />
                <span className={`text-xs font-medium flex-1 ${meta?.color ?? "text-zinc-300"}`}>
                  {meta?.label ?? r.type}
                </span>
                <span className="text-base font-bold text-white font-mono">{r.quantity.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Storage upgrade */}
      <div className="card overflow-hidden xl:order-5">
        {storage && resourceMap ? (
          <>
            <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-200">{storage.name}</span>
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Entrepot</span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {costEntries.map(([resource, cost]) => {
                  const have = resourceMap.get(resource) ?? 0;
                  const missing = Math.max(0, cost - have);
                  const enough = have >= cost;
                  const pct = Math.min(100, (have / cost) * 100);
                  const meta = RESOURCE_META[resource];

                  return (
                    <div key={resource} className="stat-pill">
                      <div className={`text-[10px] font-semibold mb-1 ${meta?.color ?? "text-zinc-400"}`}>
                        {meta?.label ?? resource}
                      </div>
                      <div className="text-xs font-bold text-white font-mono">
                        {have.toLocaleString()}<span className="text-zinc-600">/{cost.toLocaleString()}</span>
                      </div>
                      <div className="w-full energy-gauge mt-1.5">
                        <div
                          className={`energy-gauge-fill ${enough ? "bg-emerald-400" : "bg-red-400"}`}
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                      <div className={`text-[10px] mt-1 ${enough ? "text-emerald-400" : "text-red-400"}`}>
                        {enough ? "OK" : `-${missing.toLocaleString()}`}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={onUpgradeStorage}
                disabled={!canUpgrade}
                className="w-full px-4 py-2 rounded-xl text-sm btn-gaming-emerald"
              >
                {canUpgrade ? "Ameliorer l'entrepot" : "Ressources insuffisantes"}
              </button>
            </div>
          </>
        ) : (
          <div className="p-5 text-center">
            <div className="text-sm font-semibold text-zinc-300 mb-1">Entrepot</div>
            <p className="text-zinc-600 text-xs">Chargement...</p>
          </div>
        )}
      </div>

      {/* Discovered islands */}
      <div className="card p-5 xl:order-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Iles</h3>
          <span className="text-xs text-zinc-600 font-mono">{knownIslands.length}/{player.discoveredIslands.length}</span>
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {player.discoveredIslands.map((di, i) => (
            <div
              key={`${di.island.name}-${i}`}
              className="flex items-center justify-between px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(0,0,0,0.15)" }}
            >
              <span className="text-sm text-zinc-300">{di.island.name}</span>
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  di.islandState === "KNOWN"
                    ? "text-emerald-400"
                    : "text-yellow-400"
                }`}
                style={{
                  background: di.islandState === "KNOWN" ? "rgba(52,211,153,0.08)" : "rgba(251,191,36,0.08)",
                  border: `1px solid ${di.islandState === "KNOWN" ? "rgba(52,211,153,0.2)" : "rgba(251,191,36,0.2)"}`,
                }}
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
