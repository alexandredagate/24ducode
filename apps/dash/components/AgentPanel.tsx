"use client";

import { useEffect, useState } from "react";
import type { BotStatus, CapitainStatus } from "../hooks/useSocket";

interface AgentPanelProps {
  botStatus: BotStatus | null;
  capitainStatus: CapitainStatus | null;
  emit: <T = unknown>(command: string, payload?: object) => Promise<T>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; accent: string; bg: string; border: string; dotColor: string }> = {
  exploring: { label: "Exploration", color: "text-blue-400", accent: "card-accent-blue", bg: "rgba(59,130,246,0.06)", border: "rgba(59,130,246,0.15)", dotColor: "bg-blue-400" },
  refueling: { label: "Ravitaillement", color: "text-yellow-400", accent: "card-accent-yellow", bg: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.15)", dotColor: "bg-yellow-400" },
  order: { label: "Ordre du capitaine", color: "text-purple-400", accent: "card-accent-purple", bg: "rgba(168,85,247,0.06)", border: "rgba(168,85,247,0.15)", dotColor: "bg-purple-400" },
  validating: { label: "Validation d'ile", color: "text-cyan-400", accent: "card-accent-cyan", bg: "rgba(0,229,255,0.06)", border: "rgba(0,229,255,0.15)", dotColor: "bg-cyan-400" },
  zone_escape: { label: "Contournement zone", color: "text-orange-400", accent: "card-accent-orange", bg: "rgba(249,115,22,0.06)", border: "rgba(249,115,22,0.15)", dotColor: "bg-orange-400" },
  stranded: { label: "En panne", color: "text-red-400", accent: "card-accent-red", bg: "rgba(239,68,68,0.06)", border: "rgba(239,68,68,0.15)", dotColor: "bg-red-500" },
  idle: { label: "Inactif", color: "text-zinc-400", accent: "", bg: "rgba(255,255,255,0.02)", border: "rgba(255,255,255,0.06)", dotColor: "bg-zinc-500" },
};

const RESOURCE_META: Record<string, { color: string; label: string }> = {
  FERONIUM: { color: "text-cyan-400", label: "Feronium" },
  BOISIUM: { color: "text-emerald-400", label: "Boisium" },
  CHARBONIUM: { color: "text-orange-400", label: "Charbonium" },
};

function EnergyBar({ energy, max }: { energy: number; max: number }) {
  const pct = max > 0 ? (energy / max) * 100 : 0;
  const color = pct > 60 ? "bg-emerald-400" : pct > 30 ? "bg-yellow-400" : "bg-red-500";
  return (
    <div className="energy-gauge">
      <div className={`energy-gauge-fill progress-scan ${color}`} style={{ width: `${Math.max(2, pct)}%` }} />
    </div>
  );
}

export function AgentPanel({ botStatus: liveBotStatus, capitainStatus, emit }: AgentPanelProps) {
  const [initialStatus, setInitialStatus] = useState<BotStatus | null>(null);

  useEffect(() => {
    emit<BotStatus | null>("bot:status")
      .then((data) => { if (data) setInitialStatus(data); })
      .catch(() => {});
  }, [emit]);

  const botStatus = liveBotStatus ?? initialStatus;

  if (!botStatus) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="card p-10 text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center animate-float"
            style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.12)" }}>
            <span className="text-3xl">⚙</span>
          </div>
          <p className="text-zinc-400 text-sm font-medium">En attente des donnees du bot</p>
          <p className="text-zinc-600 text-xs mt-1">Snapshot toutes les ~15 moves</p>
          <div className="mt-4 mx-auto w-32 energy-gauge">
            <div className="energy-gauge-fill bg-blue-500 progress-scan" style={{ width: "40%" }} />
          </div>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[botStatus.status] ?? STATUS_CONFIG.idle;
  const lastUpdate = botStatus.timestamp
    ? new Date(botStatus.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
            style={{ background: statusCfg.bg, border: `1px solid ${statusCfg.border}` }}>⚙</span>
          Agent Bot
        </h2>
        {lastUpdate && (
          <span className="text-[11px] text-zinc-600 font-mono flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full live-dot ${statusCfg.dotColor}`} />
            MAJ {lastUpdate}
          </span>
        )}
      </div>

      {/* Status banner */}
      <div className={`card ${statusCfg.accent} p-5 hud-corner`} style={{ background: statusCfg.bg, borderColor: statusCfg.border }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`w-3 h-3 rounded-full ${statusCfg.dotColor}`}
                style={{ boxShadow: `0 0 8px currentColor` }} />
              {(botStatus.status === "exploring" || botStatus.status === "order") && (
                <div className={`absolute inset-0 w-3 h-3 rounded-full ${statusCfg.dotColor} animate-ping opacity-40`} />
              )}
            </div>
            <span className={`text-lg font-bold ${statusCfg.color}`}>{statusCfg.label}</span>
          </div>
          <div className="text-right">
            <div className="text-xs text-zinc-600 font-mono">Move #{botStatus.totalMoves}</div>
          </div>
        </div>
        {botStatus.pathReason !== "none" && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 uppercase">Path</span>
            <span className="text-xs font-mono text-cyan-400">{botStatus.pathReason}</span>
            <span className="text-[10px] text-zinc-600">({botStatus.pathLength} steps restants)</span>
          </div>
        )}
      </div>

      {/* Key metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Position */}
        <div className="card p-4">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Position</div>
          {botStatus.position ? (
            <div className="font-mono text-lg font-bold" style={{ color: "#00e5ff", textShadow: "0 0 8px rgba(0,229,255,0.2)" }}>
              ({botStatus.position.x}, {botStatus.position.y})
            </div>
          ) : (
            <div className="text-zinc-600 text-lg">-</div>
          )}
          <div className="text-[10px] text-zinc-600 mt-1">Zone {botStatus.zone} · Navire niv.{botStatus.shipLevel}</div>
        </div>

        {/* Energy */}
        <div className="card p-4">
          <div className="flex justify-between text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">
            <span>Energie</span>
            <span className={`font-bold font-mono normal-case ${botStatus.energy <= 10 ? "text-red-400" : "text-cyan-400"}`}>
              {botStatus.energy}/{botStatus.maxEnergy}
            </span>
          </div>
          <EnergyBar energy={botStatus.energy} max={botStatus.maxEnergy} />
          <div className="text-[10px] text-zinc-600 mt-1.5">
            {botStatus.energy <= 10 ? "Ravitaillement necessaire" : `${Math.round((botStatus.energy / botStatus.maxEnergy) * 100)}% restant`}
          </div>
        </div>

        {/* Quotient */}
        <div className="card card-accent-yellow p-4">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Quotient</div>
          <div className="text-2xl font-black text-yellow-400 font-mono animate-glow-pulse">
            {botStatus.quotient ?? "-"}
          </div>
          <div className="text-[10px] text-zinc-600 mt-1">{(botStatus.money ?? 0).toLocaleString()} OR</div>
        </div>

        {/* Islands */}
        <div className="card card-accent-emerald p-4">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Iles</div>
          <div className="text-2xl font-black text-emerald-400 font-mono">{botStatus.islandsFound}</div>
          <div className="text-[10px] text-zinc-600 mt-1">{botStatus.knownIslandsCount ?? 0} validees</div>
        </div>
      </div>

      {/* Exploration + Economy side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Exploration */}
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Exploration</h3>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Iles trouvees" value={botStatus.islandsFound} />
            <Stat label="Visites" value={botStatus.islandVisits} />
            <Stat label="Refuel" value={botStatus.refuelIslandsCount} />
            <Stat label="Cellules bloquees" value={botStatus.blockedCellsCount} />
          </div>
        </div>

        {/* Resources */}
        {botStatus.resources && (
          <div className="card p-5">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Ressources</h3>
            <div className="space-y-3">
              {Object.entries(botStatus.resources).map(([type, qty]) => {
                const meta = RESOURCE_META[type];
                return (
                  <div key={type} className="flex items-center gap-3">
                    <span className={`resource-dot resource-dot-${type}`} />
                    <span className={`text-xs font-medium flex-1 ${meta?.color ?? "text-zinc-300"}`}>
                      {meta?.label ?? type}
                    </span>
                    <span className="text-base font-bold text-white font-mono">{qty.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Active order */}
      {capitainStatus && capitainStatus.status !== "COMPLETED" && (
        <div className="card card-accent-purple p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 live-dot" />
              Ordre en cours
            </h3>
            {capitainStatus.progress?.target && (
              <span className="text-[11px] text-zinc-500 font-mono">
                Cap ({capitainStatus.progress.target.x}, {capitainStatus.progress.target.y})
              </span>
            )}
          </div>
          {capitainStatus.message && (
            <p className="text-[11px] text-zinc-400 mb-2">{capitainStatus.message}</p>
          )}
          {capitainStatus.progress && capitainStatus.status === "IN_PROGRESS" && (
            <div>
              <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                <span>{capitainStatus.progress.stepsRemaining} moves restants</span>
                <span className="font-mono">{capitainStatus.progress.stepsTotal - capitainStatus.progress.stepsRemaining}/{capitainStatus.progress.stepsTotal}</span>
              </div>
              <div className="energy-gauge" style={{ height: 8 }}>
                <div
                  className="energy-gauge-fill bg-purple-500 progress-scan"
                  style={{
                    width: capitainStatus.progress.stepsTotal > 0
                      ? `${((capitainStatus.progress.stepsTotal - capitainStatus.progress.stepsRemaining) / capitainStatus.progress.stepsTotal) * 100}%`
                      : "0%"
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-pill">
      <div className="text-[10px] text-zinc-500 mb-0.5">{label}</div>
      <div className="text-base font-bold font-mono text-white">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
