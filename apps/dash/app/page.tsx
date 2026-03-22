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
import type { Direction, ResourceType } from "../hooks/useSocket";

type Tab = "overview" | "ship" | "agent" | "map" | "marketplace" | "taxes" | "thefts" | "events";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Vue globale" },
  { id: "ship", label: "Bateau" },
  { id: "agent", label: "Agent" },
  { id: "map", label: "Carte" },
  { id: "marketplace", label: "Marketplace" },
  { id: "thefts", label: "Piraterie" },
  { id: "taxes", label: "Taxes" },
  { id: "events", label: "Events" },
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

  async function handleMove(direction: Direction) {
    return await emit<{ position: { id: string; x: number; y: number; type: string; zone: number }; energy: number }>(
      "ship:move",
      { direction }
    );
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
  const pendingTheftsCount = thefts.filter((t) => t.status === "PENDING").length;

  const shipPanelProps = {
    shipNextLevel,
    shipExists,
    shipLevelError,
    currentPosition,
    availableMove,
    playerResources: playerDetails?.resources ?? null,
    onMove: handleMove,
    onBuild: handleShipBuild,
    onUpgrade: handleShipUpgrade,
    onGoTo: handleGoTo,
    capitainStatus,
  };

  return (
    <div className="min-h-screen text-white flex flex-col cyber-grid-bg" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(0,240,255,0.04) 0%, var(--background) 60%)" }}>
      {/* Header */}
      <header className="glass-strong border-b border-glow-cyan px-4 sm:px-6 py-3 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight" style={{ textShadow: "0 0 15px rgba(0,240,255,0.4)" }}>3026</span>
            {playerDetails && (
              <span className="text-zinc-500 text-sm hidden sm:inline">· {playerDetails.name}</span>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {playerDetails && (
              <div className="hidden sm:flex items-center gap-4 text-sm">
                <span className="text-yellow-400 font-semibold animate-glow-pulse">
                  {playerDetails.money.toLocaleString()} OR
                </span>
                <span className="text-zinc-500">Quotient : {playerDetails.quotient}</span>
                <span className="text-emerald-400">{playerDetails.discoveredIslands.filter(i => i.islandState === "KNOWN").length} îles</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-500"}`}
                style={{ boxShadow: connected ? "0 0 8px rgba(52,211,153,0.6)" : "0 0 8px rgba(239,68,68,0.6)" }}
              />
              <span className="text-xs text-zinc-500 hidden sm:inline">{connected ? "Connecté" : "Déconnecté"}</span>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className={`px-3 py-1.5 rounded-lg glass text-zinc-300 text-xs transition-all hover:border-glow-cyan ${refreshing ? "animate-spin" : ""} disabled:opacity-40`}
            >
              &#8635;
            </button>
            <button
              type="button"
              onClick={logout}
              className="px-3 py-1.5 rounded-lg glass text-zinc-400 text-xs transition-all hover:border-glow-red hover:text-red-400"
            >
              <span className="sm:hidden">&#10005;</span>
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
        {playerDetails && (
          <div className="flex items-center gap-4 text-sm mt-2 sm:mt-0 sm:hidden">
            <span className="text-yellow-400 font-semibold">
              {playerDetails.money.toLocaleString()} OR
            </span>
            <span className="text-zinc-500">Q: {playerDetails.quotient}</span>
            <span className="text-emerald-400">{playerDetails.discoveredIslands.filter(i => i.islandState === "KNOWN").length} îles</span>
          </div>
        )}
      </header>

      {/* Navigation */}
      <nav className="glass border-b border-glow-cyan px-4 sm:px-6 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-3 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "tab-active"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab.label}
              {tab.id === "taxes" && dueTaxesCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-xs font-bold" style={{ boxShadow: "0 0 8px rgba(239,68,68,0.5)" }}>
                  {dueTaxesCount}
                </span>
              )}
              {tab.id === "thefts" && pendingTheftsCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-purple-500 text-white text-xs font-bold" style={{ boxShadow: "0 0 8px rgba(168,85,247,0.5)" }}>
                  {pendingTheftsCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <main className={`flex-1 p-4 sm:p-6 mx-auto w-full ${activeTab === "overview" || activeTab === "ship" || activeTab === "marketplace" ? "" : "max-w-4xl"}`}>
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in-up">
            {playerDetails ? (
              <PlayerCard
                player={playerDetails}
                storage={storageInfo}
                onUpgradeStorage={handleUpgradeStorage}
              />
            ) : (
              <div className="rounded-xl glass p-6 text-center text-zinc-400 text-sm">
                Chargement des données joueur...
              </div>
            )}
            <ShipPanel {...shipPanelProps} />
          </div>
        )}

        {activeTab === "ship" && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 animate-fade-in-up">
            <ShipPanel {...shipPanelProps} />
          </div>
        )}

        {activeTab === "agent" && (
          <div className="max-w-xl mx-auto animate-fade-in-up">
            <AgentPanel botStatus={botStatus} capitainStatus={capitainStatus} emit={emit} />
          </div>
        )}

        {activeTab === "map" && (
          <div className="animate-fade-in-up">
            <MapPanel
              mapGrid={mapGrid}
              shipPosition={currentPosition ? { x: currentPosition.x, y: currentPosition.y } : null}
              onRefresh={refreshMapGrid}
            />
          </div>
        )}

        {activeTab === "marketplace" && (
          <div className="animate-fade-in-up">
            <MarketplacePanel
              offers={marketOffers}
              playerName={playerDetails?.name ?? ""}
              onPurchase={handlePurchase}
              onCreateOffer={handleCreateOffer}
              onUpdateOffer={handleUpdateOffer}
              onDeleteOffer={handleDeleteOffer}
              onRefresh={refreshAll}
              marketplaceDiscovered={playerDetails?.marketPlaceDiscovered ?? false}
            />
          </div>
        )}

        {activeTab === "thefts" && (
          <div className="animate-fade-in-up">
            <TheftPanel
              thefts={thefts}
              playerMoney={playerDetails?.money ?? 0}
              onAttack={handleTheftAttack}
              onRefresh={refreshAll}
            />
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
  );
}
