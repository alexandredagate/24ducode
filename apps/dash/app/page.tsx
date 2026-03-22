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
import { useSocket } from "../hooks/useSocket";
import type { Direction, ResourceType } from "../hooks/useSocket";

type Tab = "overview" | "ship" | "map" | "marketplace" | "taxes" | "thefts" | "events";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Vue globale" },
  { id: "ship", label: "Bateau" },
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
    // map:update + ship:position broadcasts gèrent la mise à jour
  }

  async function handleShipBuild() {
    const result = await emit("ship:build");
    refreshAll(); // Pas de broadcast pour build, refresh nécessaire
    return result;
  }

  async function handleShipUpgrade() {
    if (!shipNextLevel?.level) return;
    const result = await emit("ship:upgrade", { level: shipNextLevel.level.id });
    refreshAll(); // Pas de broadcast pour upgrade, refresh nécessaire
    return result;
  }

  async function handleUpgradeStorage() {
    await emit("storage:upgrade");
    refreshAll(); // Pas de broadcast pour storage, refresh nécessaire
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
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-900 px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight">3026</span>
            {playerDetails && (
              <span className="text-zinc-500 text-sm hidden sm:inline">· {playerDetails.name}</span>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {playerDetails && (
              <div className="hidden sm:flex items-center gap-4 text-sm">
                <span className="text-yellow-400 font-semibold">
                  {playerDetails.money.toLocaleString()} OR
                </span>
                <span className="text-zinc-500">Quotient : {playerDetails.quotient}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-500"}`} />
              <span className="text-xs text-zinc-500 hidden sm:inline">{connected ? "Connecté" : "Déconnecté"}</span>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors disabled:opacity-40"
            >
              {refreshing ? "↻" : "↻"}
            </button>
            <button
              type="button"
              onClick={logout}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs transition-colors"
            >
              <span className="sm:hidden">✕</span>
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
          </div>
        )}
      </header>

      <nav className="border-b border-zinc-800 bg-zinc-900 px-4 sm:px-6 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "text-white border-b-2 border-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab.label}
              {tab.id === "taxes" && dueTaxesCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-xs font-bold">
                  {dueTaxesCount}
                </span>
              )}
              {tab.id === "thefts" && pendingTheftsCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-purple-500 text-white text-xs font-bold">
                  {pendingTheftsCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full">
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              {playerDetails ? (
                <PlayerCard
                  player={playerDetails}
                  storage={storageInfo}
                  onUpgradeStorage={handleUpgradeStorage}
                />
              ) : (
                <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-6 text-center text-zinc-400 text-sm">
                  Chargement des données joueur...
                </div>
              )}
            </div>
            <div>
              <ShipPanel {...shipPanelProps} />
            </div>
          </div>
        )}

        {activeTab === "ship" && (
          <div className="max-w-md mx-auto">
            <ShipPanel {...shipPanelProps} />
          </div>
        )}

        {activeTab === "map" && (
          <MapPanel
            mapGrid={mapGrid}
            shipPosition={currentPosition ? { x: currentPosition.x, y: currentPosition.y } : null}
            onRefresh={refreshMapGrid}
          />
        )}

        {activeTab === "marketplace" && (
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
        )}

        {activeTab === "thefts" && (
          <TheftPanel
            thefts={thefts}
            playerMoney={playerDetails?.money ?? 0}
            onAttack={handleTheftAttack}
            onRefresh={refreshAll}
          />
        )}

        {activeTab === "taxes" && (
          <TaxesPanel taxes={taxes} onPay={handleTaxPay} onRefresh={refreshAll} />
        )}

        {activeTab === "events" && (
          <BrokerEventsPanel events={brokerEvents} onClear={clearBrokerEvents} />
        )}
      </main>
    </div>
  );
}
