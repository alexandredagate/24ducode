"use client";

import { useMemo, useState } from "react";
import type { BrokerEvent } from "../hooks/useSocket";

const TYPE_CONFIG: Record<string, { color: string; bg: string; border: string; icon: string; label: string }> = {
  OFFER_CREATED: { color: "#34d399", bg: "rgba(52,211,153,0.06)", border: "rgba(52,211,153,0.15)", icon: "📦", label: "Offre creee" },
  OFFER_DELETED: { color: "#ef4444", bg: "rgba(239,68,68,0.06)", border: "rgba(239,68,68,0.15)", icon: "🗑", label: "Offre supprimee" },
  OFFER_UPDATED: { color: "#fbbf24", bg: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.15)", icon: "✏", label: "Offre modifiee" },
  OFFER_PURCHASED: { color: "#3b82f6", bg: "rgba(59,130,246,0.06)", border: "rgba(59,130,246,0.15)", icon: "🛒", label: "Achat" },
  THEFT_RESOLVED: { color: "#f97316", bg: "rgba(249,115,22,0.06)", border: "rgba(249,115,22,0.15)", icon: "⚔", label: "Vol resolu" },
  THEFT_CREATED: { color: "#a855f7", bg: "rgba(168,85,247,0.06)", border: "rgba(168,85,247,0.15)", icon: "🏴‍☠️", label: "Vol lance" },
  ISLAND_DISCOVERED: { color: "#00e5ff", bg: "rgba(0,229,255,0.06)", border: "rgba(0,229,255,0.15)", icon: "🏝", label: "Ile decouverte" },
  TAX_CREATED: { color: "#ef4444", bg: "rgba(239,68,68,0.06)", border: "rgba(239,68,68,0.15)", icon: "📋", label: "Taxe emise" },
  TAX_PAID: { color: "#34d399", bg: "rgba(52,211,153,0.06)", border: "rgba(52,211,153,0.15)", icon: "✓", label: "Taxe payee" },
  MAP_UPDATE: { color: "#64748b", bg: "rgba(100,116,139,0.06)", border: "rgba(100,116,139,0.15)", icon: "🗺", label: "Carte MAJ" },
  SHIP_POSITION: { color: "#64748b", bg: "rgba(100,116,139,0.06)", border: "rgba(100,116,139,0.15)", icon: "📍", label: "Position" },
};

const DEFAULT_CFG = { color: "#94a3b8", bg: "rgba(148,163,184,0.04)", border: "rgba(148,163,184,0.1)", icon: "📡", label: "" };

export function BrokerEventsPanel({
  events,
  onClear,
}: {
  events: BrokerEvent[];
  onClear: () => void;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");

  const types = useMemo(() => [...new Set(events.map((e) => e.type))], [events]);
  const filtered = useMemo(() => {
    let result = filter ? events.filter((e) => e.type === filter) : events;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.type.toLowerCase().includes(q) ||
        JSON.stringify(e.data).toLowerCase().includes(q)
      );
    }
    return result;
  }, [events, filter, search]);

  // Count by type for the sidebar
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    return counts;
  }, [events]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
            style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.15)" }}>📡</span>
          Events en temps reel
          <span className="text-sm text-zinc-600 font-normal">({events.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="w-40 pl-7 pr-3 py-1.5 rounded-lg text-xs input-gaming"
            />
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <button type="button" onClick={onClear}
            className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-500 hover:text-red-400 transition-colors"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            Effacer
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Sidebar — type filters */}
        <div className="lg:w-56 xl:w-64 shrink-0">
          <div className="card p-3 lg:sticky lg:top-20">
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2 mb-2">Filtrer par type</h3>

            <button
              type="button"
              onClick={() => setFilter("")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-all mb-0.5 ${
                filter === "" ? "text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
              style={filter === "" ? { background: "rgba(0,229,255,0.06)", border: "1px solid rgba(0,229,255,0.12)" } : {}}
            >
              <span className="text-xs">📡</span>
              <span className="flex-1 text-xs font-medium">Tous</span>
              <span className="text-[10px] text-zinc-600 font-mono">{events.length}</span>
            </button>

            <div className="divider my-1.5" />

            <div className="space-y-0.5 max-h-[50vh] overflow-y-auto">
              {types.map((type) => {
                const cfg = TYPE_CONFIG[type] ?? DEFAULT_CFG;
                const count = typeCounts[type] ?? 0;
                const active = filter === type;

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFilter(active ? "" : type)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all ${
                      active ? "text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
                    }`}
                    style={active ? { background: cfg.bg, border: `1px solid ${cfg.border}` } : {}}
                  >
                    <span className="text-xs">{cfg.icon}</span>
                    <span className="flex-1 text-xs font-medium truncate">{cfg.label || type}</span>
                    <span className="text-[10px] font-mono shrink-0" style={{ color: active ? cfg.color : undefined }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Events list */}
        <div className="flex-1 min-w-0">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center animate-float"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <span className="text-3xl opacity-30">📡</span>
                </div>
                <p className="text-zinc-500 text-sm">Aucun evenement</p>
                <p className="text-zinc-700 text-xs mt-1">Les events du broker apparaitront ici en temps reel</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[80vh] overflow-y-auto pr-1">
              {filtered.map((event, i) => {
                const isExpanded = expandedId === event.id;
                const time = new Date(event.receivedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                const cfg = TYPE_CONFIG[event.type] ?? DEFAULT_CFG;

                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : event.id)}
                    className={`w-full text-left rounded-xl transition-all animate-fade-in-up group`}
                    style={{
                      background: isExpanded ? cfg.bg : "rgba(255,255,255,0.015)",
                      border: `1px solid ${isExpanded ? cfg.border : "rgba(255,255,255,0.04)"}`,
                      animationDelay: i < 20 ? `${i * 20}ms` : "0ms",
                    }}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Icon */}
                      <span className="text-base w-6 text-center shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                        {cfg.icon}
                      </span>

                      {/* Type + label */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold" style={{ color: cfg.color }}>
                            {cfg.label || event.type}
                          </span>
                          {cfg.label && cfg.label !== event.type && (
                            <span className="text-[10px] text-zinc-700 font-mono hidden sm:inline">{event.type}</span>
                          )}
                        </div>
                      </div>

                      {/* Time */}
                      <span className="text-[11px] text-zinc-600 font-mono shrink-0">{time}</span>

                      {/* Chevron */}
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        className={`shrink-0 text-zinc-700 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-3 ml-9">
                        <div className="rounded-lg p-3 overflow-x-auto" style={{ background: "rgba(0,0,0,0.25)" }}>
                          <pre className="text-[11px] text-cyan-400/70 whitespace-pre-wrap break-all font-mono leading-relaxed">
                            {JSON.stringify(event.data, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
