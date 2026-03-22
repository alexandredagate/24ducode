"use client";

import { useState } from "react";
import { BrokerEventsPanel } from "../components/BrokerEventsPanel";
import { LoginForm } from "../components/LoginForm";
import { MapPanel } from "../components/MapPanel";
import { MarketplacePanel } from "../components/MarketplacePanel";
import { PlayerCard } from "../components/PlayerCard";
import { ShipPanel } from "../components/ShipPanel";
import { TaxesPanel } from "../components/TaxesPanel";
import { TheftPanel } from "../components/TheftPanel";
import { AgentPanel } from "../components/AgentPanel";
import { useSocket } from "../hooks/useSocket";
import type { ResourceType } from "../hooks/useSocket";

type Tab = "overview" | "ship" | "agent" | "map" | "marketplace" | "taxes" | "thefts" | "events";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Vue globale", icon: "⬡" },
  { id: "ship", label: "Bateau", icon: "⛵" },
  { id: "agent", label: "Agent", icon: "⚙" },
  { id: "map", label: "Carte", icon: "🗺" },
  { id: "marketplace", label: "Marché", icon: "💰" },
  { id: "thefts", label: "Piraterie", icon: "⚔" },
  { id: "taxes", label: "Taxes", icon: "📋" },
  { id: "events", label: "Events", icon: "📡" },
];

export default function Home() {
  const {
    connected,
    authenticated,
    login,
    logout,
    emit,
    playerDetails,
    shipNextLevel,
    shipExists,
    shipLevelError,
    currentPosition,
    availableMove,
    taxes,
    marketOffers,
    thefts,
    storageInfo,
    mapGrid,
    refreshMapGrid,
    brokerEvents,
    clearBrokerEvents,
    capitainStatus,
    botStatus,
    refreshAll,
    lastError,
  } = useSocket();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    refreshAll();
    setTimeout(() => setRefreshing(false), 1000);
  }

  async function handleShipBuild() {
    const result = await emit("ship:build");
    refreshAll();
    return result;
  }

  async function handleShipUpgrade() {
    if (!shipNextLevel?.level) return;
    const result = await emit("ship:upgrade", { level: shipNextLevel.level.id });
    refreshAll();
    return result;
  }

  async function handleUpgradeStorage() {
    await emit("storage:upgrade");
    refreshAll();
  }

  async function handleTaxPay(taxId: string) {
    const result = await emit("tax:pay", { taxId });
    refreshAll();
    return result;
  }

  async function handlePurchase(offerId: string, quantity: number) {
    const result = await emit("marketplace:purchase", { offerId, quantity });
    refreshAll();
    return result;
  }

  async function handleCreateOffer(resourceType: ResourceType, quantityIn: number, pricePerResource: number) {
    const result = await emit("marketplace:create-offer", { resourceType, quantityIn, pricePerResource });
    refreshAll();
    return result;
  }

  async function handleDeleteOffer(offerId: string) {
    const result = await emit("marketplace:delete-offer", { offerId });
    refreshAll();
    return result;
  }

  async function handleUpdateOffer(offerId: string, resourceType: ResourceType, quantityIn: number, pricePerResource: number) {
    const result = await emit("marketplace:update-offer", { offerId, resourceType, quantityIn, pricePerResource });
    refreshAll();
    return result;
  }

  async function handleTheftAttack(resourceType: ResourceType, moneySpent: number) {
    const result = await emit("theft:attack", { resourceType, moneySpent });
    refreshAll();
    return result;
  }

  async function handleGoTo(x: number, y: number) {
    return await emit("capitain:go-to", { x, y });
  }

  if (!authenticated) {
    return <LoginForm onLogin={login} connected={connected} error={lastError} />;
  }

  const dueTaxesCount = taxes.filter((t) => t.state === "DUE").length;
  const dueTaxesTotal = taxes.filter((t) => t.state === "DUE").reduce((s, t) => s + t.amount, 0);
  const pendingTheftsCount = thefts.filter((t) => t.status === "PENDING").length;
  const knownIslands = playerDetails?.discoveredIslands.filter(i => i.islandState === "KNOWN").length ?? 0;

  const shipPanelProps = {
    shipNextLevel,
    shipExists,
    shipLevelError,
    currentPosition,
    availableMove,
    playerResources: playerDetails?.resources ?? null,
    onBuild: handleShipBuild,
    onUpgrade: handleShipUpgrade,
    onGoTo: handleGoTo,
    capitainStatus,
  };

  return (
    <div className="min-h-screen text-white flex grid-bg">
      {/* Sidebar — desktop only */}
      <aside className="sidebar hidden lg:flex flex-col w-60 fixed inset-y-0 left-0 z-40">
        <div className="px-5 py-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black"
            style={{ background: "linear-gradient(135deg, rgba(0,229,255,0.15), rgba(59,130,246,0.15))", border: "1px solid rgba(0,229,255,0.25)", textShadow: "0 0 10px rgba(0,229,255,0.5)", color: "#00e5ff" }}>
            30
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-white">3026</div>
            <div className="text-[10px] text-zinc-500 leading-none">Commandement</div>
          </div>
        </div>

        {playerDetails && (
          <div className="mx-3 mb-3 px-3 py-2.5 rounded-xl space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400 truncate">{playerDetails.name}</span>
              <span className="text-[10px] text-zinc-600">Q:{playerDetails.quotient}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-yellow-400 font-mono">{playerDetails.money.toLocaleString()}</span>
              <span className="text-[10px] text-zinc-600">OR</span>
            </div>
            <div className="divider" />
            <div className="space-y-1">
              {playerDetails.resources.map(r => (
                <div key={r.type} className="flex items-center gap-2">
                  <span className={`resource-dot resource-dot-${r.type}`} />
                  <span className="text-[10px] text-zinc-500 flex-1">{r.type === "FERONIUM" ? "Fer" : r.type === "BOISIUM" ? "Bois" : "Charb"}</span>
                  <span className="text-[10px] text-zinc-300 font-mono">{r.quantity.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {botStatus && (
          <div className="mx-3 mb-3 px-3 py-2 rounded-xl flex items-center gap-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
            <div className={`w-1.5 h-1.5 rounded-full live-dot ${
              botStatus.status === "exploring" ? "bg-blue-400" : botStatus.status === "stranded" ? "bg-red-500" : "bg-emerald-400"
            }`} />
            <span className="text-[10px] text-zinc-500 flex-1 truncate">
              {botStatus.status === "exploring" ? "Exploration" : botStatus.status === "refueling" ? "Refuel" : botStatus.status === "stranded" ? "Panne" : botStatus.status === "order" ? "Ordre" : botStatus.status === "validating" ? "Validation" : botStatus.status}
            </span>
            <span className="text-[10px] text-zinc-600 font-mono">#{botStatus.totalMoves}</span>
          </div>
        )}

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {TABS.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={`sidebar-link w-full ${activeTab === tab.id ? "sidebar-link-active" : ""}`}>
              <span className="text-base w-5 text-center opacity-70">{tab.icon}</span>
              <span className="flex-1 text-left">{tab.label}</span>
              {tab.id === "taxes" && dueTaxesCount > 0 && <span className="badge badge-red">{dueTaxesCount}</span>}
              {tab.id === "thefts" && pendingTheftsCount > 0 && <span className="badge badge-purple">{pendingTheftsCount}</span>}
              {tab.id === "events" && brokerEvents.length > 0 && <span className="text-[10px] text-zinc-600 font-mono">{brokerEvents.length}</span>}
            </button>
          ))}
        </nav>

        <div className="p-3 space-y-2">
          <div className="divider" />
          <div className="flex items-center justify-between px-2 py-1">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-red-500"}`}
                style={{ boxShadow: connected ? "0 0 6px rgba(52,211,153,0.6)" : "0 0 6px rgba(239,68,68,0.6)" }} />
              <span className="text-[11px] text-zinc-500">{connected ? "En ligne" : "Hors ligne"}</span>
            </div>
            <button type="button" onClick={logout} className="text-[11px] text-zinc-600 hover:text-red-400 transition-colors">Quitter</button>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen pb-16 lg:pb-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 px-4 sm:px-6 py-3 flex items-center justify-between gap-4" style={{ background: "rgba(6,9,15,0.85)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex items-center gap-3 lg:hidden">
            <span className="text-base font-bold" style={{ color: "#00e5ff", textShadow: "0 0 10px rgba(0,229,255,0.3)" }}>3026</span>
            {playerDetails && <span className="text-xs text-zinc-500 truncate max-w-[100px]">{playerDetails.name}</span>}
          </div>
          <div className="hidden lg:flex items-center gap-2">
            <h1 className="text-sm font-semibold text-zinc-200">
              {TABS.find((t) => t.id === activeTab)?.icon} {TABS.find((t) => t.id === activeTab)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {playerDetails && (
              <div className="hidden sm:flex items-center gap-3 mr-2">
                <span className="text-xs font-mono text-yellow-400 font-semibold animate-glow-pulse">{playerDetails.money.toLocaleString()} OR</span>
                <span className="text-xs text-zinc-600">Q:{playerDetails.quotient}</span>
                <span className="text-xs text-emerald-500">{knownIslands} iles</span>
              </div>
            )}
            <button type="button" onClick={handleRefresh} disabled={refreshing}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-all ${refreshing ? "animate-spin" : ""}`}
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              </svg>
            </button>
            <div className="lg:hidden flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-red-500"}`}
                style={{ boxShadow: connected ? "0 0 6px rgba(52,211,153,0.5)" : "0 0 6px rgba(239,68,68,0.5)" }} />
              <button type="button" onClick={logout} className="text-xs text-zinc-500 hover:text-red-400 transition-colors">Quitter</button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 sm:p-6 w-full">
          {/* ===== OVERVIEW ===== */}
          {activeTab === "overview" && (
            <div className="space-y-5 animate-fade-in-up">
              {/* KPI row */}
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
                <div className="card card-accent-yellow p-4">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Tresor</div>
                  <div className="text-2xl font-black text-yellow-400 font-mono mt-1 animate-glow-pulse">{(playerDetails?.money ?? 0).toLocaleString()}</div>
                  <div className="text-[10px] text-zinc-600">OR</div>
                </div>
                <div className="card p-4">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Quotient</div>
                  <div className="text-2xl font-black text-white font-mono mt-1">{playerDetails?.quotient ?? "-"}</div>
                </div>
                <div className="card card-accent-cyan p-4">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Energie</div>
                  <div className="text-2xl font-black font-mono mt-1" style={{ color: (availableMove ?? 0) <= 5 ? "#ef4444" : "#00e5ff" }}>{availableMove ?? "-"}</div>
                  <div className="text-[10px] text-zinc-600">mouvements</div>
                </div>
                <div className="card card-accent-emerald p-4">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Iles connues</div>
                  <div className="text-2xl font-black text-emerald-400 font-mono mt-1">{knownIslands}</div>
                  <div className="text-[10px] text-zinc-600">/{playerDetails?.discoveredIslands.length ?? 0} decouvertes</div>
                </div>
                {currentPosition && (
                  <div className="card card-accent-blue p-4">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Position</div>
                    <div className="text-lg font-black font-mono mt-1" style={{ color: "#00e5ff" }}>({currentPosition.x}, {currentPosition.y})</div>
                    <div className="text-[10px] text-zinc-600">Zone {currentPosition.zone}</div>
                  </div>
                )}
                {botStatus && (
                  <div className="card p-4">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full live-dot ${botStatus.status === "exploring" ? "bg-blue-400" : botStatus.status === "stranded" ? "bg-red-500" : "bg-emerald-400"}`} />
                      Agent
                    </div>
                    <div className="text-lg font-black text-white font-mono mt-1 capitalize">{botStatus.status}</div>
                    <div className="text-[10px] text-zinc-600">Move #{botStatus.totalMoves}</div>
                  </div>
                )}
              </div>

              {/* Alerts */}
              {(dueTaxesCount > 0 || pendingTheftsCount > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dueTaxesCount > 0 && (
                    <button type="button" onClick={() => setActiveTab("taxes")}
                      className="card card-accent-red p-4 flex items-center gap-4 text-left hover:bg-white/[0.03] transition-colors alert-pulse">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                        <span className="text-lg">📋</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-red-400">{dueTaxesCount} taxe{dueTaxesCount > 1 ? "s" : ""} a payer</div>
                        <div className="text-xs text-zinc-500">{dueTaxesTotal.toLocaleString()} OR total</div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-600 shrink-0"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  )}
                  {pendingTheftsCount > 0 && (
                    <button type="button" onClick={() => setActiveTab("thefts")}
                      className="card card-accent-purple p-4 flex items-center gap-4 text-left hover:bg-white/[0.03] transition-colors">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}>
                        <span className="text-lg">⚔</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-purple-400">{pendingTheftsCount} vol{pendingTheftsCount > 1 ? "s" : ""} en cours</div>
                        <div className="text-xs text-zinc-500">Cliquez pour voir les details</div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-600 shrink-0"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  )}
                </div>
              )}

              {/* Cards grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {playerDetails ? (
                  <PlayerCard player={playerDetails} storage={storageInfo} onUpgradeStorage={handleUpgradeStorage} />
                ) : (
                  <div className="card p-6 text-center text-zinc-500 text-sm">Chargement...</div>
                )}
                <ShipPanel {...shipPanelProps} />
              </div>
            </div>
          )}

          {/* ===== SHIP ===== */}
          {activeTab === "ship" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in-up">
              <ShipPanel {...shipPanelProps} />
            </div>
          )}

          {activeTab === "agent" && (
            <div className="max-w-4xl mx-auto animate-fade-in-up">
              <AgentPanel botStatus={botStatus} capitainStatus={capitainStatus} emit={emit} />
            </div>
          )}

          {activeTab === "map" && (
            <div className="animate-fade-in-up">
              <MapPanel mapGrid={mapGrid} shipPosition={currentPosition ? { x: currentPosition.x, y: currentPosition.y } : null} onRefresh={refreshMapGrid} />
            </div>
          )}

          {activeTab === "marketplace" && (
            <div className="animate-fade-in-up">
              <MarketplacePanel offers={marketOffers} playerName={playerDetails?.name ?? ""} onPurchase={handlePurchase}
                onCreateOffer={handleCreateOffer} onUpdateOffer={handleUpdateOffer} onDeleteOffer={handleDeleteOffer}
                onRefresh={refreshAll} marketplaceDiscovered={playerDetails?.marketPlaceDiscovered ?? false} />
            </div>
          )}

          {activeTab === "thefts" && (
            <div className="animate-fade-in-up">
              <TheftPanel thefts={thefts} playerMoney={playerDetails?.money ?? 0} onAttack={handleTheftAttack} onRefresh={refreshAll} />
            </div>
          )}

          {activeTab === "taxes" && (
            <div className="animate-fade-in-up">
              <TaxesPanel taxes={taxes} onPay={handleTaxPay} onRefresh={refreshAll} />
            </div>
          )}

          {activeTab === "events" && (
            <div className="animate-fade-in-up">
              <BrokerEventsPanel events={brokerEvents} onClear={clearBrokerEvents} />
            </div>
          )}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav fixed bottom-0 inset-x-0 z-40 lg:hidden safe-area-pb">
        <div className="flex justify-around px-1 py-1.5">
          {TABS.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={`bottom-nav-link flex-1 ${activeTab === tab.id ? "bottom-nav-link-active" : ""}`}>
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className="truncate max-w-[48px]">{tab.label}</span>
              {tab.id === "taxes" && dueTaxesCount > 0 && <span className="absolute -top-0.5 right-1/4 badge badge-red text-[8px] min-w-[14px] h-[14px]">{dueTaxesCount}</span>}
              {tab.id === "thefts" && pendingTheftsCount > 0 && <span className="absolute -top-0.5 right-1/4 badge badge-purple text-[8px] min-w-[14px] h-[14px]">{pendingTheftsCount}</span>}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
