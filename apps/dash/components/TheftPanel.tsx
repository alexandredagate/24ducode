"use client";

import { useState, useEffect } from "react";
import type { ResourceType, Theft } from "../hooks/useSocket";

interface TheftPanelProps {
  thefts: Theft[];
  playerMoney: number;
  onAttack: (resourceType: ResourceType, moneySpent: number) => Promise<unknown>;
  onRefresh: () => void;
}

const RESOURCE_COLORS: Record<ResourceType, string> = {
  FERONIUM: "text-cyan-400",
  BOISIUM: "text-emerald-400",
  CHARBONIUM: "text-orange-400",
};

const CHANCE_COLORS: Record<string, string> = {
  FAIBLE: "text-red-400",
  MOYENNE: "text-yellow-400",
  FORTE: "text-emerald-400",
};

const RESOURCE_OPTIONS: ResourceType[] = ["FERONIUM", "BOISIUM", "CHARBONIUM"];

export function TheftPanel({ thefts, playerMoney, onAttack, onRefresh }: TheftPanelProps) {
  const [resourceType, setResourceType] = useState<ResourceType>("FERONIUM");
  const [moneySpent, setMoneySpent] = useState(500);
  const [attacking, setAttacking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [now, setNow] = useState(() => Date.now());
  const pending = thefts.filter((t) => t.status === "PENDING");
  const resolved = thefts.filter((t) => t.status !== "PENDING");

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
      setMessage("Attaque lancée ! Le vol sera résolu dans quelques minutes.");
      onRefresh();
    } catch (err) {
      setMessage(`Erreur: ${err instanceof Error ? err.message : "inconnue"}`);
    } finally {
      setAttacking(false);
    }
  }

  function formatDate(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  }

  function parseISO(iso: string) {
    // Truncate microseconds to milliseconds for browser compatibility
    return new Date(iso.replace(/(\.\d{3})\d+/, "$1")).getTime();
  }

  function formatCountdown(resolveAt: string) {
    const end = parseISO(resolveAt);
    const remaining = Math.max(0, Math.floor((end - now) / 1000));
    if (remaining <= 0) return "Résolution imminente";
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    if (m === 0) return `${s}s`;
    return `${m}m`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Piraterie</h2>
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

      {/* Formulaire d'attaque */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wide">
          Lancer une attaque
        </h3>
        <p className="text-xs text-zinc-500">
          Envoyez des pirates voler la ressource ciblée au joueur le plus riche. Plus vous investissez d'OR, plus les chances de succès sont élevées.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Ressource ciblée</label>
            <select
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value as ResourceType)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-purple-500"
            >
              {RESOURCE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              OR investi <span className="text-zinc-600">(dispo: {playerMoney.toLocaleString()})</span>
            </label>
            <input
              type="number"
              min={1}
              max={playerMoney}
              value={moneySpent}
              onChange={(e) => setMoneySpent(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAttack}
            disabled={attacking || moneySpent <= 0 || moneySpent > playerMoney}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors disabled:opacity-40"
          >
            {attacking ? "Envoi..." : "Attaquer"}
          </button>
          {moneySpent > playerMoney && (
            <span className="text-xs text-red-400">Pas assez d'OR</span>
          )}
        </div>
      </div>

      {/* Vols en cours */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-yellow-400 uppercase tracking-wide">
            En cours ({pending.length})
          </h3>
          {pending.map((theft) => (
            <div
              key={theft.id}
              className="rounded-xl bg-yellow-950 border border-yellow-800 p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${RESOURCE_COLORS[theft.resourceType as ResourceType] ?? "text-white"}`}>
                    {theft.resourceType}
                  </span>
                  <span className="text-xs text-yellow-500">·</span>
                  <span className={`text-xs font-medium ${CHANCE_COLORS[theft.chance] ?? "text-zinc-400"}`}>
                    Chance: {theft.chance}
                  </span>
                </div>
                <span className="text-xs text-yellow-600">
                  {formatCountdown(theft.resolveAt)}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm">
                <span className="text-yellow-300">{theft.moneySpent.toLocaleString()} OR investis</span>
                {theft.amountAttempted > 0 && (
                  <span className="text-zinc-400">Quantité visée: {theft.amountAttempted}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Historique */}
      {resolved.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
            Historique ({resolved.length})
          </h3>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {resolved.map((theft) => {
              const success = theft.status === "SUCCESS";
              return (
                <div
                  key={theft.id}
                  className={`rounded-lg border px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 ${
                    success
                      ? "bg-emerald-950 border-emerald-800"
                      : "bg-red-950 border-red-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold uppercase ${success ? "text-emerald-400" : "text-red-400"}`}>
                      {theft.status}
                    </span>
                    <span className={`text-sm ${RESOURCE_COLORS[theft.resourceType as ResourceType] ?? "text-white"}`}>
                      {theft.resourceType}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {theft.moneySpent.toLocaleString()} OR
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    {theft.amountAttempted > 0 && (
                      <span>{success ? "Volé" : "Tenté"}: {theft.amountAttempted}</span>
                    )}
                    <span>{formatDate(theft.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {thefts.length === 0 && (
        <div className="text-center text-zinc-500 text-sm py-8">
          Aucun vol pour le moment
        </div>
      )}
    </div>
  );
}
