"use client";

import { useState, useEffect, useMemo } from "react";
import type { ResourceType, Theft } from "../hooks/useSocket";

interface TheftPanelProps {
  thefts: Theft[];
  playerMoney: number;
  onAttack: (resourceType: ResourceType, moneySpent: number) => Promise<unknown>;
  onRefresh: () => void;
}

const RESOURCE_META: Record<ResourceType, { color: string; label: string }> = {
  FERONIUM: { color: "text-cyan-400", label: "Feronium" },
  BOISIUM: { color: "text-emerald-400", label: "Boisium" },
  CHARBONIUM: { color: "text-orange-400", label: "Charbonium" },
};

const CHANCE_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  FAIBLE: { text: "text-red-400", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)" },
  MOYENNE: { text: "text-yellow-400", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.2)" },
  FORTE: { text: "text-emerald-400", bg: "rgba(52,211,153,0.08)", border: "rgba(52,211,153,0.2)" },
};

const RESOURCE_OPTIONS: ResourceType[] = ["FERONIUM", "BOISIUM", "CHARBONIUM"];

function parseISO(iso: string) {
  return new Date(iso.replace(/(\.\d{3})\d+/, "$1")).getTime();
}

export function TheftPanel({ thefts, playerMoney, onAttack, onRefresh }: TheftPanelProps) {
  const [resourceType, setResourceType] = useState<ResourceType>("FERONIUM");
  const [moneySpent, setMoneySpent] = useState(500);
  const [attacking, setAttacking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [now, setNow] = useState(() => Date.now());
  const pending = thefts.filter((t) => t.status === "PENDING");
  const resolved = thefts.filter((t) => t.status !== "PENDING");

  const stats = useMemo(() => {
    const successes = thefts.filter(t => t.status === "SUCCESS");
    const failures = thefts.filter(t => t.status === "FAILURE");
    const totalInvested = thefts.reduce((s, t) => s + t.moneySpent, 0);
    const winRate = (successes.length + failures.length) > 0
      ? Math.round((successes.length / (successes.length + failures.length)) * 100)
      : 0;
    return { successes: successes.length, failures: failures.length, totalInvested, winRate, pending: pending.length };
  }, [thefts, pending.length]);

  useEffect(() => {
    if (pending.length === 0) return;
    const hasLastMinute = pending.some((t) => {
      const end = parseISO(t.resolveAt);
      return end - now <= 60_000 && end - now > 0;
    });
    const delay = hasLastMinute ? 1000 : 60_000;
    const interval = setInterval(() => setNow(Date.now()), delay);
    return () => clearInterval(interval);
  }, [pending.length, pending, now]);

  async function handleAttack() {
    if (moneySpent <= 0) return;
    setAttacking(true);
    setMessage(null);
    try {
      await onAttack(resourceType, moneySpent);
      setMessage("Attaque lancee !");
      onRefresh();
    } catch (err) {
      setMessage(`Erreur: ${err instanceof Error ? err.message : "inconnue"}`);
    } finally {
      setAttacking(false);
    }
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  }

  function isResolved(theft: Theft) {
    return parseISO(theft.resolveAt) <= now;
  }

  function formatCountdown(resolveAt: string) {
    const remaining = Math.max(0, Math.floor((parseISO(resolveAt) - now) / 1000));
    if (remaining <= 0) return "Imminente";
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    return m === 0 ? `${s}s` : `${m}m ${s}s`;
  }

  const sliderMax = Math.max(playerMoney, 1);
  const investPct = Math.round((moneySpent / sliderMax) * 100);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
            style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.15)" }}>⚔</span>
          Piraterie
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          className="px-4 py-2 rounded-xl text-xs font-medium btn-primary"
        >
          Actualiser
        </button>
      </div>

      {message && (
        <div className="px-4 py-2.5 rounded-xl text-sm toast" style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.15)", color: "#c084fc" }}>
          {message}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card card-accent-yellow p-4">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">En cours</div>
          <div className="text-2xl font-black text-yellow-400 font-mono mt-1">{stats.pending}</div>
        </div>
        <div className="card card-accent-emerald p-4">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Reussis</div>
          <div className="text-2xl font-black text-emerald-400 font-mono mt-1">{stats.successes}</div>
        </div>
        <div className="card card-accent-red p-4">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Echoues</div>
          <div className="text-2xl font-black text-red-400 font-mono mt-1">{stats.failures}</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Taux reussite</div>
          <div className="text-2xl font-black text-white font-mono mt-1">{stats.winRate}%</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Total investi</div>
          <div className="text-2xl font-black text-yellow-400 font-mono mt-1">{stats.totalInvested.toLocaleString()}</div>
          <div className="text-[10px] text-zinc-600">OR</div>
        </div>
      </div>

      {/* Main content — 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left — Attack form + pending */}
        <div className="lg:col-span-2 space-y-4">
          {/* Attack form */}
          <div className="card card-accent-purple p-5 space-y-4">
            <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
              Lancer une attaque
            </h3>

            <div>
              <label htmlFor="resource-type" className="block text-[10px] text-zinc-500 mb-1.5 uppercase">Ressource ciblee</label>
              <div className="grid grid-cols-3 gap-1.5">
                {RESOURCE_OPTIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setResourceType(r)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      resourceType === r ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                    style={{
                      background: resourceType === r ? "rgba(168,85,247,0.12)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${resourceType === r ? "rgba(168,85,247,0.3)" : "rgba(255,255,255,0.06)"}`,
                    }}
                  >
                    {RESOURCE_META[r].label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="money-spent" className="text-[10px] text-zinc-500 uppercase">Investissement</label>
                <span className="text-xs font-mono font-bold text-purple-400">{moneySpent.toLocaleString()} OR</span>
              </div>
              <input
                id="money-spent"
                type="range"
                min={0}
                max={sliderMax}
                step={Math.max(1, Math.floor(sliderMax / 100))}
                value={moneySpent}
                onChange={(e) => setMoneySpent(Number(e.target.value))}
                className="w-full mb-1"
              />
              <div className="flex items-center justify-between text-[10px] text-zinc-600">
                <span>0</span>
                <span>{investPct}% de votre or</span>
                <span>{playerMoney.toLocaleString()}</span>
              </div>
              {/* Quick buttons */}
              <div className="flex gap-1.5 mt-2">
                {[10, 25, 50, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setMoneySpent(Math.floor(playerMoney * pct / 100))}
                    className="flex-1 py-1 rounded-lg text-[10px] font-semibold text-zinc-500 hover:text-zinc-300 transition-colors"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleAttack}
              disabled={attacking || moneySpent <= 0 || moneySpent > playerMoney}
              className="w-full px-5 py-2.5 rounded-xl text-sm font-semibold btn-gaming-purple"
            >
              {attacking ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Envoi...
                </span>
              ) : `Attaquer — ${moneySpent.toLocaleString()} OR`}
            </button>
            {moneySpent > playerMoney && (
              <p className="text-[11px] text-red-400 text-center">Fonds insuffisants</p>
            )}
          </div>

          {/* Pending thefts */}
          {pending.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 live-dot" />
                En cours ({pending.length})
              </h3>
              <div className="space-y-2">
                {pending.map((theft) => {
                  const chanceCfg = CHANCE_COLORS[theft.chance];
                  return (
                    <div key={theft.id} className="card card-accent-yellow p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${RESOURCE_META[theft.resourceType as ResourceType]?.color ?? "text-white"}`}>
                            {RESOURCE_META[theft.resourceType as ResourceType]?.label ?? theft.resourceType}
                          </span>
                          {chanceCfg && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${chanceCfg.text}`}
                              style={{ background: chanceCfg.bg, border: `1px solid ${chanceCfg.border}` }}>
                              {theft.chance}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-yellow-500 font-mono font-semibold">
                          {isResolved(theft)
                            ? "Imminente"
                            : parseISO(theft.resolveAt) - now <= 60_000
                              ? formatCountdown(theft.resolveAt)
                              : formatDate(theft.resolveAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-yellow-300 font-mono">{theft.moneySpent.toLocaleString()} OR</span>
                        {theft.amountAttempted > 0 && (
                          <span className="text-zinc-500">Vise: {theft.amountAttempted}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right — History */}
        <div className="lg:col-span-3">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-2">
            Historique ({resolved.length})
          </h3>

          {resolved.length === 0 ? (
            <div className="card p-10 text-center">
              <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="text-2xl opacity-30">⚔</span>
              </div>
              <p className="text-zinc-500 text-sm">Aucun vol termine</p>
              <p className="text-zinc-700 text-xs mt-1">Les resultats apparaitront ici</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              {/* Table header */}
              <div className="px-4 py-2.5 flex items-center gap-3 text-[10px] text-zinc-600 uppercase tracking-wider"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span className="w-14">Statut</span>
                <span className="w-20">Ressource</span>
                <span className="flex-1">Investissement</span>
                <span className="w-16 text-right">Quantite</span>
                <span className="w-14 text-right">Heure</span>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {resolved.map((theft, i) => {
                  const success = theft.status === "SUCCESS";
                  return (
                    <div
                      key={theft.id}
                      className="px-4 py-3 flex items-center gap-3 transition-colors hover:bg-white/[0.02]"
                      style={{ borderBottom: i < resolved.length - 1 ? "1px solid rgba(255,255,255,0.03)" : undefined }}
                    >
                      <span className="w-14">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${success ? "text-emerald-400" : "text-red-400"}`}
                          style={{
                            background: success ? "rgba(52,211,153,0.08)" : "rgba(239,68,68,0.08)",
                            border: `1px solid ${success ? "rgba(52,211,153,0.15)" : "rgba(239,68,68,0.15)"}`,
                          }}>
                          {success ? "WIN" : "FAIL"}
                        </span>
                      </span>
                      <span className={`w-20 text-sm ${RESOURCE_META[theft.resourceType as ResourceType]?.color ?? "text-white"}`}>
                        {RESOURCE_META[theft.resourceType as ResourceType]?.label ?? theft.resourceType}
                      </span>
                      <span className="flex-1 text-sm text-zinc-300 font-mono">
                        {theft.moneySpent.toLocaleString()} OR
                      </span>
                      <span className="w-16 text-right text-sm text-zinc-400 font-mono">
                        {theft.amountAttempted > 0 ? theft.amountAttempted : "-"}
                      </span>
                      <span className="w-14 text-right text-[11px] text-zinc-600 font-mono">
                        {formatDate(theft.createdAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {thefts.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-3xl opacity-30">⚔</span>
            </div>
            <p className="text-zinc-500 text-sm">Aucun vol pour le moment</p>
            <p className="text-zinc-700 text-xs mt-1">Lancez votre premiere attaque</p>
          </div>
        </div>
      )}
    </div>
  );
}
