"use client";

import { useEffect, useState } from "react";
import type { BotStatus, CapitainStatus } from "../hooks/useSocket";

interface AgentPanelProps {
  botStatus: BotStatus | null;
  capitainStatus: CapitainStatus | null;
  emit: <T = unknown>(command: string, payload?: object) => Promise<T>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; glow: string }> = {
  exploring: { label: "Exploration", color: "text-blue-400", glow: "glow-blue border-glow-blue" },
  refueling: { label: "Ravitaillement", color: "text-yellow-400", glow: "glow-yellow border-glow-yellow" },
  order: { label: "Ordre du capitaine", color: "text-purple-400", glow: "glow-purple border-glow-purple" },
  validating: { label: "Validation d'ile", color: "text-cyan-400", glow: "glow-cyan border-glow-cyan" },
  zone_escape: { label: "Contournement zone", color: "text-orange-400", glow: "glow-orange border-glow-orange" },
  stranded: { label: "En panne", color: "text-red-400", glow: "glow-red border-glow-red" },
  idle: { label: "Inactif", color: "text-zinc-400", glow: "" },
};

function EnergyBar({ energy, max }: { energy: number; max: number }) {
  const pct = max > 0 ? (energy / max) * 100 : 0;
  const color = pct > 60 ? "bg-emerald-400" : pct > 30 ? "bg-yellow-400" : "bg-red-500";
  return (
    <div className="h-2.5 rounded-full bg-black/30 overflow-hidden">
      <div className={`h-full rounded-full transition-all progress-scan ${color}`} style={{ width: `${Math.max(2, pct)}%` }} />
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
      <div className="rounded-xl glass p-6 text-center">
        <p className="text-zinc-500 text-sm">En attente des donnees du bot...</p>
        <p className="text-zinc-600 text-xs mt-1">Le bot envoie un snapshot toutes les ~15 moves</p>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[botStatus.status] ?? STATUS_CONFIG.idle;

  return (
    <div className="space-y-4">
      {/* Status principal */}
      <div className={`rounded-xl glass p-5 card-3d hud-corner ${statusCfg.glow}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${botStatus.status === "exploring" ? "bg-blue-400 animate-pulse" : botStatus.status === "stranded" ? "bg-red-500" : "bg-emerald-400"}`}
              style={{ boxShadow: `0 0 8px ${botStatus.status === "exploring" ? "rgba(59,130,246,0.6)" : botStatus.status === "stranded" ? "rgba(239,68,68,0.6)" : "rgba(52,211,153,0.6)"}` }}
            />
            <span className={`text-lg font-bold ${statusCfg.color}`}>{statusCfg.label}</span>
          </div>
          <span className="text-xs text-zinc-500 font-mono">Move #{botStatus.totalMoves}</span>
        </div>
        {botStatus.pathReason !== "none" && (
          <p className="text-xs text-zinc-400">
            Path: <span className="font-mono text-cyan-300">{botStatus.pathReason}</span> ({botStatus.pathLength} steps restants)
          </p>
        )}
      </div>

      {/* Position + Energie */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl glass p-4 card-3d">
          <div className="text-xs text-zinc-500 mb-1">Position</div>
          {botStatus.position ? (
            <div className="font-mono text-cyan-300 text-lg font-bold" style={{ textShadow: "0 0 8px rgba(0,240,255,0.3)" }}>
              ({botStatus.position.x}, {botStatus.position.y})
            </div>
          ) : (
            <div className="text-zinc-500">-</div>
          )}
          <div className="text-xs text-zinc-500 mt-1">Zone {botStatus.zone}</div>
        </div>
        <div className="rounded-xl glass p-4 card-3d">
          <div className="flex justify-between text-xs text-zinc-500 mb-1">
            <span>Energie</span>
            <span className={`font-bold font-mono ${botStatus.energy <= 10 ? "text-red-400" : "text-cyan-300"}`}>
              {botStatus.energy}/{botStatus.maxEnergy}
            </span>
          </div>
          <EnergyBar energy={botStatus.energy} max={botStatus.maxEnergy} />
          <div className="text-xs text-zinc-500 mt-1">Ship level {botStatus.shipLevel}</div>
        </div>
      </div>

      {/* Stats exploration */}
      <div className="rounded-xl glass p-5 card-3d">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3 section-header">Exploration</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Iles trouvees" value={botStatus.islandsFound} />
          <Stat label="Visites d'iles" value={botStatus.islandVisits} />
          <Stat label="Iles refuel" value={botStatus.refuelIslandsCount} />
          <Stat label="Cells bloquees" value={botStatus.blockedCellsCount} />
        </div>
      </div>

      {/* Economie */}
      {botStatus.quotient != null && (
        <div className="rounded-xl glass p-5 card-3d">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3 section-header">Economie</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Quotient" value={botStatus.quotient} highlight />
            <Stat label="Or" value={botStatus.money ?? 0} />
            <Stat label="Iles KNOWN" value={botStatus.knownIslandsCount ?? 0} />
            <Stat label="Moves total" value={botStatus.totalMoves} />
          </div>
          {botStatus.resources && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {Object.entries(botStatus.resources).map(([type, qty]) => (
                <div key={type} className="rounded-lg bg-black/20 border border-white/5 px-3 py-2 text-center">
                  <div className={`text-xs font-semibold ${
                    type === "BOISIUM" ? "text-emerald-400" : type === "FERONIUM" ? "text-cyan-400" : "text-orange-400"
                  }`}>{type}</div>
                  <div className="text-sm font-bold text-white mt-0.5 font-mono">{qty.toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ordre en cours */}
      {capitainStatus && capitainStatus.status !== "COMPLETED" && (
        <div className={`rounded-xl glass p-5 card-3d ${
          capitainStatus.status === "IN_PROGRESS" ? "glow-purple border-glow-purple" :
          capitainStatus.status === "FAILED" ? "glow-red border-glow-red" :
          ""
        }`}>
          <h3 className="text-sm font-semibold text-zinc-300 mb-2 section-header">Ordre du capitaine</h3>
          {capitainStatus.progress?.target && (
            <p className="text-xs text-zinc-400 mb-2">
              Cap vers <span className="font-mono text-cyan-300">({capitainStatus.progress.target.x}, {capitainStatus.progress.target.y})</span>
            </p>
          )}
          {capitainStatus.message && (
            <p className="text-xs text-zinc-300">{capitainStatus.message}</p>
          )}
          {capitainStatus.progress && capitainStatus.status === "IN_PROGRESS" && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-zinc-500 mb-1">
                <span>{capitainStatus.progress.stepsRemaining} moves restants</span>
                <span className="font-mono">{capitainStatus.progress.stepsTotal - capitainStatus.progress.stepsRemaining}/{capitainStatus.progress.stepsTotal}</span>
              </div>
              <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all progress-scan"
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

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-black/20 border border-white/5 px-3 py-2.5 text-center">
      <div className="text-xs text-zinc-500 mb-0.5">{label}</div>
      <div className={`text-lg font-bold font-mono ${highlight ? "text-yellow-400 animate-glow-pulse" : "text-white"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
