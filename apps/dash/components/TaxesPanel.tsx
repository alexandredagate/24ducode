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

  async function handlePay(taxId: string) {
    setPaying(taxId);
    setMessage(null);
    try {
      await onPay(taxId);
      setMessage("Taxe payée avec succès.");
      onRefresh();
    } catch (err) {
      setMessage(`Erreur: ${err instanceof Error ? err.message : "inconnue"}`);
    } finally {
      setPaying(null);
    }
  }

  function formatRemaining(sec: number) {
    if (sec <= 0) return "Immédiate";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Taxes</h2>
        <button
          type="button"
          onClick={onRefresh}
          className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-1 rounded bg-zinc-800"
        >
          Actualiser
        </button>
      </div>

      {message && (
        <div className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm">
          {message}
        </div>
      )}

      {/* Taxes DUE */}
      {due.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wide">
            À payer ({due.length})
          </h3>
          {due.map((tax) => (
            <div
              key={tax.id}
              className="rounded-xl bg-red-950 border border-red-800 p-4 flex items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-red-300 uppercase">{tax.type}</span>
                  <span className="text-xs text-red-500">·</span>
                  <span className="text-xs text-red-400">{tax.player.name}</span>
                </div>
                <div className="text-xl font-bold text-red-200 mt-0.5">{tax.amount} OR</div>
                <div className="text-xs text-red-500 mt-0.5">
                  Délai : {formatRemaining(tax.remainingTime)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handlePay(tax.id)}
                disabled={paying === tax.id}
                className="shrink-0 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors disabled:opacity-40"
              >
                {paying === tax.id ? "..." : "Payer"}
              </button>
            </div>
          ))}
        </div>
      )}

      {due.length === 0 && (
        <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-4 text-center">
          <div className="text-emerald-400 text-lg">✓</div>
          <p className="text-zinc-400 text-sm mt-1">Aucune taxe en attente</p>
        </div>
      )}

      {/* Taxes PAID */}
      {paid.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
            Payées ({paid.length})
          </h3>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {paid.map((tax) => (
              <div
                key={tax.id}
                className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 flex items-center justify-between opacity-60"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 uppercase font-medium">{tax.type}</span>
                  <span className="text-sm text-zinc-400">{tax.amount} OR</span>
                </div>
                <span className="text-xs text-emerald-600 font-medium">PAYÉE</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {taxes.length === 0 && (
        <div className="text-center text-zinc-500 text-sm py-8">
          Aucune taxe pour le moment
        </div>
      )}
    </div>
  );
}
