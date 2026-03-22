"use client";

import { useState } from "react";
import type { Tax } from "../hooks/useSocket";

interface TaxesPanelProps {
  taxes: Tax[];
  onPay: (taxId: string) => Promise<unknown>;
  onRefresh: () => void;
}

export function TaxesPanel({ taxes, onPay, onRefresh }: TaxesPanelProps) {
  const [paying, setPaying] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const due = taxes.filter((t) => t.state === "DUE");
  const paid = taxes.filter((t) => t.state === "PAID");
  const totalDue = due.reduce((sum, t) => sum + t.amount, 0);
  const totalPaid = paid.reduce((sum, t) => sum + t.amount, 0);

  async function handlePay(taxId: string) {
    setPaying(taxId);
    setMessage(null);
    try {
      await onPay(taxId);
      setMessage("Taxe payee avec succes.");
      onRefresh();
    } catch (err) {
      setMessage(`Erreur: ${err instanceof Error ? err.message : "inconnue"}`);
    } finally {
      setPaying(null);
    }
  }

  async function handlePayAll() {
    setMessage(null);
    for (const tax of due) {
      setPaying(tax.id);
      try {
        await onPay(tax.id);
      } catch (err) {
        setMessage(`Erreur sur ${tax.id}: ${err instanceof Error ? err.message : "inconnue"}`);
        setPaying(null);
        return;
      }
    }
    setPaying(null);
    setMessage("Toutes les taxes ont ete payees.");
    onRefresh();
  }

  function formatRemaining(sec: number) {
    if (sec <= 0) return "Immediate";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>📋</span>
          Taxes
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
        <div className="px-4 py-2.5 rounded-xl text-sm animate-fade-in-up" style={{ background: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.1)", color: "#67e8f9" }}>
          {message}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card card-accent-red p-4">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">A payer</div>
          <div className="text-2xl font-black text-red-400 font-mono mt-1">{due.length}</div>
          <div className="text-xs text-zinc-600 mt-0.5">{totalDue.toLocaleString()} OR total</div>
        </div>
        <div className="card card-accent-emerald p-4">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Payees</div>
          <div className="text-2xl font-black text-emerald-400 font-mono mt-1">{paid.length}</div>
          <div className="text-xs text-zinc-600 mt-0.5">{totalPaid.toLocaleString()} OR total</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Total taxes</div>
          <div className="text-2xl font-black text-white font-mono mt-1">{taxes.length}</div>
          <div className="text-xs text-zinc-600 mt-0.5">{(totalDue + totalPaid).toLocaleString()} OR</div>
        </div>
        <div className="card p-4 flex items-center justify-center">
          {due.length > 0 ? (
            <button
              type="button"
              onClick={handlePayAll}
              disabled={paying !== null}
              className="w-full py-2.5 rounded-xl text-sm font-semibold btn-gaming-red"
            >
              {paying ? "..." : `Tout payer (${totalDue} OR)`}
            </button>
          ) : (
            <div className="text-center">
              <div className="text-emerald-400 text-2xl mb-0.5">✓</div>
              <div className="text-[11px] text-zinc-500">A jour</div>
            </div>
          )}
        </div>
      </div>

      {/* Main content — two columns on large */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Due taxes */}
        <div>
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" style={{ boxShadow: "0 0 6px rgba(239,68,68,0.6)" }} />
            En attente ({due.length})
          </h3>

          {due.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.12)" }}>
                <span className="text-2xl">✓</span>
              </div>
              <p className="text-zinc-400 text-sm font-medium">Aucune taxe en attente</p>
              <p className="text-zinc-600 text-xs mt-1">Vous etes en regle !</p>
            </div>
          ) : (
            <div className="space-y-2">
              {due.map((tax, i) => (
                <div
                  key={tax.id}
                  className="card card-accent-red overflow-hidden animate-fade-in-up"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="p-4 flex items-center gap-4">
                    {/* Left — urgency indicator */}
                    <div className="shrink-0">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{
                          background: tax.remainingTime <= 60 ? "rgba(239,68,68,0.15)" : "rgba(251,191,36,0.08)",
                          border: `1px solid ${tax.remainingTime <= 60 ? "rgba(239,68,68,0.3)" : "rgba(251,191,36,0.15)"}`,
                        }}
                      >
                        <span className="text-lg">{tax.remainingTime <= 60 ? "🔴" : "🟡"}</span>
                      </div>
                    </div>

                    {/* Center — info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
                          {tax.type}
                        </span>
                        <span className="text-[11px] text-zinc-600">{tax.player.name}</span>
                      </div>
                      <div className="text-xl font-black text-white font-mono">{tax.amount.toLocaleString()} <span className="text-sm text-zinc-500">OR</span></div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-600">
                          <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                        </svg>
                        <span className={`text-xs font-mono ${tax.remainingTime <= 60 ? "text-red-400 font-bold" : "text-zinc-500"}`}>
                          {formatRemaining(tax.remainingTime)}
                        </span>
                      </div>
                    </div>

                    {/* Right — pay button */}
                    <button
                      type="button"
                      onClick={() => handlePay(tax.id)}
                      disabled={paying === tax.id}
                      className="shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold btn-gaming-red"
                    >
                      {paying === tax.id ? (
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : "Payer"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Paid taxes */}
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" style={{ boxShadow: "0 0 4px rgba(52,211,153,0.4)" }} />
            Historique ({paid.length})
          </h3>

          {paid.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-zinc-600 text-sm">Aucune taxe payee</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              {/* Table header */}
              <div className="px-4 py-2.5 flex items-center gap-4 text-[10px] text-zinc-600 uppercase tracking-wider"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span className="w-16">Type</span>
                <span className="flex-1">Joueur</span>
                <span className="w-24 text-right">Montant</span>
                <span className="w-16 text-right">Statut</span>
              </div>
              {/* Table rows */}
              <div className="max-h-[50vh] overflow-y-auto">
                {paid.map((tax, i) => (
                  <div
                    key={tax.id}
                    className="px-4 py-3 flex items-center gap-4 transition-colors hover:bg-white/[0.02]"
                    style={{ borderBottom: i < paid.length - 1 ? "1px solid rgba(255,255,255,0.03)" : undefined }}
                  >
                    <span className="w-16 text-[11px] text-zinc-600 uppercase font-medium">{tax.type}</span>
                    <span className="flex-1 text-sm text-zinc-400 truncate">{tax.player.name}</span>
                    <span className="w-24 text-right text-sm text-zinc-300 font-mono">{tax.amount} OR</span>
                    <span className="w-16 text-right">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(52,211,153,0.08)", color: "#34d399", border: "1px solid rgba(52,211,153,0.15)" }}>
                        PAYEE
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {taxes.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-3xl opacity-40">📋</span>
            </div>
            <p className="text-zinc-500 text-sm">Aucune taxe pour le moment</p>
            <p className="text-zinc-700 text-xs mt-1">Les taxes apparaitront ici quand elles seront emises</p>
          </div>
        </div>
      )}
    </div>
  );
}
