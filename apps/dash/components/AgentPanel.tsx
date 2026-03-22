"use client";

import { useEffect, useState } from "react";
import type { BotStatus, CapitainStatus } from "../hooks/useSocket";

interface AgentPanelProps {
  botStatus: BotStatus | null;
  capitainStatus: CapitainStatus | null;
  emit: <T = unknown>(command: string, payload?: object) => Promise<T>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  exploring: { label: "Exploration", color: "text-blue-400", bg: "bg-blue-950 border-blue-800" },
  refueling: { label: "Ravitaillement", color: "text-yellow-400", bg: "bg-yellow-950 border-yellow-800" },
  order: { label: "Ordre du capitaine", color: "text-purple-400", bg: "bg-purple-950 border-purple-800" },
  validating: { label: "Validation d'ile", color: "text-cyan-400", bg: "bg-cyan-950 border-cyan-800" },
  zone_escape: { label: "Contournement zone", color: "text-orange-400", bg: "bg-orange-950 border-orange-800" },
  stranded: { label: "En panne", color: "text-red-400", bg: "bg-red-950 border-red-800" },
  idle: { label: "Inactif", color: "text-zinc-400", bg: "bg-zinc-800 border-zinc-700" },
};

function EnergyBar({ energy, max }: { energy: number; max: number }) {
  const pct = max > 0 ? (energy / max) * 100 : 0;
  const color = pct > 60 ? "bg-emerald-400" : pct > 30 ? "bg-yellow-400" : "bg-red-500";
  return (
    <div className="h-2.5 rounded-full bg-zinc-700 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.max(2, pct)}%` }} />
    </div>
  );
}

export function AgentPanel({ botStatus: liveBotStatus, capitainStatus, emit }: AgentPanelProps) {
  const [initialStatus, setInitialStatus] = useState<BotStatus | null>(null);

  // Charger le dernier snapshot depuis la DB au montage
  useEffect(() => {
    emit<BotStatus | null>("bot:status")
      .then((data) => { if (data) setInitialStatus(data); })
      .catch(() => {});
  }, [emit]);

  // Utiliser le live status si dispo, sinon le dernier snapshot de la DB
  const botStatus = liveBotStatus ?? initialStatus;

  if (!botStatus) {
    return (
      <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-6 text-center">
        <p className="text-zinc-500 text-sm">En attente des donnees du bot...</p>
        <p className="text-zinc-600 text-xs mt-1">Le bot envoie un snapshot toutes les ~15 moves</p>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[botStatus.status] ?? STATUS_CONFIG.idle;

  return (
    <div className="space-y-4">
      {/* Status principal */}
      <div className={`rounded-xl border p-5 ${statusCfg.bg}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${botStatus.status === "exploring" ? "bg-blue-400 animate-pulse" : botStatus.status === "stranded" ? "bg-red-500" : "bg-emerald-400"}`} />
            <span className={`text-lg font-bold ${statusCfg.color}`}>{statusCfg.label}</span>
          </div>
          <span className="text-xs text-zinc-500 font-mono">Move #{botStatus.totalMoves}</span>
        </div>
        {botStatus.pathReason !== "none" && (
          <p className="text-xs text-zinc-400">
            Path: <span className="font-mono text-zinc-300">{botStatus.pathReason}</span> ({botStatus.pathLength} steps restants)
          </p>
        )}
      </div>

      {/* Position + Energie */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-4">
          <div className="text-xs text-zinc-500 mb-1">Position</div>
          {botStatus.position ? (
            <div className="font-mono text-white text-lg font-bold">
              ({botStatus.position.x}, {botStatus.position.y})
            </div>
          ) : (
            <div className="text-zinc-500">-</div>
          )}
          <div className="text-xs text-zinc-500 mt-1">Zone {botStatus.zone}</div>
        </div>
        <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-4">
          <div className="flex justify-between text-xs text-zinc-500 mb-1">
            <span>Energie</span>
            <span className={`font-bold ${botStatus.energy <= 10 ? "text-red-400" : "text-zinc-300"}`}>
              {botStatus.energy}/{botStatus.maxEnergy}
            </span>
          </div>
          <EnergyBar energy={botStatus.energy} max={botStatus.maxEnergy} />
          <div className="text-xs text-zinc-500 mt-1">Ship level {botStatus.shipLevel}</div>
        </div>
      </div>

      {/* Stats exploration */}
      <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-5">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Exploration</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Iles trouvees" value={botStatus.islandsFound} />
          <Stat label="Visites d'iles" value={botStatus.islandVisits} />
          <Stat label="Iles refuel" value={botStatus.refuelIslandsCount} />
          <Stat label="Cells bloquees" value={botStatus.blockedCellsCount} />
        </div>
      </div>

      {/* Economie (si enrichi) */}
      {botStatus.quotient != null && (
        <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-5">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Economie</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Quotient" value={botStatus.quotient} highlight />
            <Stat label="Or" value={botStatus.money ?? 0} />
            <Stat label="Iles KNOWN" value={botStatus.knownIslandsCount ?? 0} />
            <Stat label="Moves total" value={botStatus.totalMoves} />
          </div>
          {botStatus.resources && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {Object.entries(botStatus.resources).map(([type, qty]) => (
                <div key={type} className="rounded-lg bg-zinc-900 px-3 py-2 text-center">
                  <div className={`text-xs font-semibold ${
                    type === "BOISIUM" ? "text-emerald-400" : type === "FERONIUM" ? "text-cyan-400" : "text-orange-400"
                  }`}>{type}</div>
                  <div className="text-sm font-bold text-white mt-0.5">{qty.toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ordre en cours */}
      {capitainStatus && capitainStatus.status !== "COMPLETED" && (
        <div className={`rounded-xl border p-5 ${
          capitainStatus.status === "IN_PROGRESS" ? "bg-purple-950 border-purple-800" :
          capitainStatus.status === "FAILED" ? "bg-red-950 border-red-800" :
          "bg-zinc-800 border-zinc-700"
        }`}>
          <h3 className="text-sm font-semibold text-zinc-300 mb-2">Ordre du capitaine</h3>
          {capitainStatus.progress?.target && (
            <p className="text-xs text-zinc-400 mb-2">
              Cap vers <span className="font-mono text-white">({capitainStatus.progress.target.x}, {capitainStatus.progress.target.y})</span>
            </p>
          )}
          {capitainStatus.message && (
            <p className="text-xs text-zinc-300">{capitainStatus.message}</p>
          )}
          {capitainStatus.progress && capitainStatus.status === "IN_PROGRESS" && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-zinc-500 mb-1">
                <span>{capitainStatus.progress.stepsRemaining} moves restants</span>
                <span>{capitainStatus.progress.stepsTotal - capitainStatus.progress.stepsRemaining}/{capitainStatus.progress.stepsTotal}</span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all"
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
    <div className="rounded-lg bg-zinc-900 px-3 py-2.5 text-center">
      <div className="text-xs text-zinc-500 mb-0.5">{label}</div>
      <div className={`text-lg font-bold ${highlight ? "text-yellow-400" : "text-white"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
