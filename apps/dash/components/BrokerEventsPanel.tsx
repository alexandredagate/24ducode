"use client";

import { useState } from "react";
import type { BrokerEvent } from "../hooks/useSocket";

const TYPE_COLORS: Record<string, string> = {
  OFFER_CREATED: "text-emerald-400",
  OFFER_DELETED: "text-red-400",
  OFFER_UPDATED: "text-yellow-400",
  THEFT_RESOLVED: "text-orange-400",
  ISLAND_DISCOVERED: "text-cyan-400",
};

const TYPE_GLOWS: Record<string, string> = {
  OFFER_CREATED: "glow-emerald",
  OFFER_DELETED: "glow-red",
  OFFER_UPDATED: "glow-yellow",
  THEFT_RESOLVED: "glow-orange",
  ISLAND_DISCOVERED: "glow-cyan",
};

export function BrokerEventsPanel({
  events,
  onClear,
}: {
  events: BrokerEvent[];
  onClear: () => void;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filter, setFilter] = useState("");

  const types = [...new Set(events.map((e) => e.type))];
  const filtered = filter ? events.filter((e) => e.type === filter) : events;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-lg font-semibold section-header">
          Broker Events
          <span className="ml-2 text-sm text-zinc-500 font-normal">
            ({events.length} reçus)
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg px-2 py-1.5 text-xs input-gaming"
          >
            <option value="">Tous les types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onClear}
            className="px-3 py-1.5 rounded-lg glass hover:border-glow-red text-zinc-400 hover:text-red-400 text-xs transition-all"
          >
            Vider
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl glass p-8 text-center text-zinc-500 text-sm">
          Aucun événement reçu pour le moment. Les événements du broker apparaîtront ici en temps réel.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
          {filtered.map((event) => {
            const isExpanded = expandedId === event.id;
            const time = new Date(event.receivedAt).toLocaleTimeString("fr-FR");
            const colorClass = TYPE_COLORS[event.type] ?? "text-zinc-300";
            const glowClass = TYPE_GLOWS[event.type] ?? "";

            return (
              <button
                key={event.id}
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : event.id)}
                className={`w-full text-left rounded-lg glass transition-all hover:bg-white/5 ${isExpanded ? glowClass : ""}`}
              >
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-xs text-zinc-500 font-mono w-16 sm:w-20 shrink-0">
                    {time}
                  </span>
                  <span className={`text-sm font-medium ${colorClass}`}>
                    {event.type}
                  </span>
                  <span className="ml-auto text-zinc-600 text-xs">
                    {isExpanded ? "\u25B2" : "\u25BC"}
                  </span>
                </div>
                {isExpanded && (
                  <pre className="px-4 pb-3 text-xs text-cyan-300/70 overflow-x-auto whitespace-pre-wrap break-all font-mono">
                    {JSON.stringify(event.data, null, 2)}
                  </pre>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
