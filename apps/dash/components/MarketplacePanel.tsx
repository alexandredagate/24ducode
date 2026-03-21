"use client";

import { useEffect, useState } from "react";
import type { MarketOffer, ResourceType } from "../hooks/useSocket";

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const COOLDOWNS_KEY = "marketplace_cooldowns";

function loadCooldowns(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(COOLDOWNS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveCooldown(offerId: string, ts: number) {
  const existing = loadCooldowns();
  existing[offerId] = ts;
  localStorage.setItem(COOLDOWNS_KEY, JSON.stringify(existing));
}

function clearCooldown(offerId: string) {
  const existing = loadCooldowns();
  delete existing[offerId];
  localStorage.setItem(COOLDOWNS_KEY, JSON.stringify(existing));
}

function getRemainingSeconds(offerId: string): number {
  const cooldowns = loadCooldowns();
  const ts = cooldowns[offerId];
  if (!ts) return 0;
  const elapsed = Date.now() - ts;
  const remaining = COOLDOWN_MS - elapsed;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

const RESOURCE_COLORS: Record<string, string> = {
  FERONIUM: "text-cyan-400",
  BOISIUM: "text-emerald-400",
  CHARBONIUM: "text-orange-400",
};

interface MarketplacePanelProps {
  offers: MarketOffer[];
  playerName: string;
  onPurchase: (offerId: string, quantity: number) => Promise<unknown>;
  onCreateOffer: (resourceType: ResourceType, quantityIn: number, pricePerResource: number) => Promise<unknown>;
  onUpdateOffer: (offerId: string, resourceType: ResourceType, quantityIn: number, pricePerResource: number) => Promise<unknown>;
  onDeleteOffer: (offerId: string) => Promise<unknown>;
  onRefresh: () => void;
  marketplaceDiscovered: boolean;
}

interface EditState {
  offerId: string;
  resourceType: ResourceType;
  qty: string;
  price: string;
}

export function MarketplacePanel({
  offers,
  playerName,
  onPurchase,
  onCreateOffer,
  onUpdateOffer,
  onDeleteOffer,
  onRefresh,
  marketplaceDiscovered,
}: MarketplacePanelProps) {
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [buyQty, setBuyQty] = useState<Record<string, number>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [remainingMap, setRemainingMap] = useState<Record<string, number>>({});

  // Compte à rebours toutes les secondes
  useEffect(() => {
    function tick() {
      const cooldowns = loadCooldowns();
      const next: Record<string, number> = {};
      for (const id of Object.keys(cooldowns)) {
        const r = getRemainingSeconds(id);
        if (r > 0) next[id] = r;
        else clearCooldown(id);
      }
      setRemainingMap(next);
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const [createResource, setCreateResource] = useState<ResourceType>("BOISIUM");
  const [createQty, setCreateQty] = useState("");
  const [createPrice, setCreatePrice] = useState("");
  const [creating, setCreating] = useState(false);

  const myOffers = offers.filter((o) => o.owner.name === playerName);
  const othersOffers = offers.filter((o) => o.owner.name !== playerName);

  async function handleBuy(offer: MarketOffer) {
    const qty = buyQty[offer.id] ?? offer.quantityIn;
    setBuyingId(offer.id);
    setMessage(null);
    try {
      await onPurchase(offer.id, qty);
      setMessage(`Achat de ${qty} ${offer.resourceType} effectué.`);
      onRefresh();
    } catch (err) {
      setMessage(`Erreur achat: ${err instanceof Error ? err.message : "inconnue"}`);
    } finally {
      setBuyingId(null);
    }
  }

  function startEdit(offer: MarketOffer) {
    setEditing({
      offerId: offer.id,
      resourceType: offer.resourceType,
      qty: String(offer.quantityIn),
      price: String(offer.pricePerResource),
    });
    setMessage(null);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const qty = Number.parseInt(editing.qty, 10);
    const price = Number.parseFloat(editing.price);
    if (!qty || !price) return;
    setUpdating(true);
    setMessage(null);
    try {
      await onUpdateOffer(editing.offerId, editing.resourceType, qty, price);
      saveCooldown(editing.offerId, Date.now());
      setMessage(`Offre modifiée : ${qty} ${editing.resourceType} à ${price} OR/u.`);
      setEditing(null);
      onRefresh();
    } catch (err) {
      setMessage(`Erreur modification: ${err instanceof Error ? err.message : "inconnue"}`);
    } finally {
      setUpdating(false);
    }
  }

  async function handleDelete(offerId: string) {
    setDeletingId(offerId);
    setMessage(null);
    try {
      await onDeleteOffer(offerId);
      clearCooldown(offerId);
      setMessage("Offre supprimée.");
      onRefresh();
    } catch (err) {
      setMessage(`Erreur: ${err instanceof Error ? err.message : "inconnue"}`);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number.parseInt(createQty, 10);
    const price = Number.parseFloat(createPrice);
    if (!qty || !price) return;
    setCreating(true);
    setMessage(null);
    try {
      const result = await onCreateOffer(createResource, qty, price) as { id?: string } | null;
      if (result?.id) saveCooldown(result.id, Date.now());
      setMessage(`Offre créée : ${qty} ${createResource} à ${price} OR/u.`);
      setCreateQty("");
      setCreatePrice("");
      onRefresh();
    } catch (err) {
      setMessage(`Erreur création: ${err instanceof Error ? err.message : "inconnue"}`);
    } finally {
      setCreating(false);
    }
  }

  if (!marketplaceDiscovered) {
    return (
      <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-8 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h2 className="text-lg font-bold text-white mb-1">Marketplace verrouillée</h2>
        <p className="text-zinc-400 text-sm">
          Découvrez et validez l'île du Marché Central pour débloquer la marketplace.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Marketplace</h2>
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

      {/* Créer une offre */}
      <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-4">
        <h3 className="text-sm font-semibold text-zinc-200 mb-3">Créer une offre</h3>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-2 items-end">
          <div>
            <label htmlFor="create-resource" className="block text-xs text-zinc-500 mb-1">Ressource</label>
            <select
              id="create-resource"
              value={createResource}
              onChange={(e) => setCreateResource(e.target.value as ResourceType)}
              className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-zinc-500"
            >
              <option value="FERONIUM">FERONIUM</option>
              <option value="BOISIUM">BOISIUM</option>
              <option value="CHARBONIUM">CHARBONIUM</option>
            </select>
          </div>
          <div>
            <label htmlFor="create-qty" className="block text-xs text-zinc-500 mb-1">Quantité</label>
            <input
              id="create-qty"
              type="number"
              value={createQty}
              onChange={(e) => setCreateQty(e.target.value)}
              placeholder="1000"
              min="1"
              className="w-28 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label htmlFor="create-price" className="block text-xs text-zinc-500 mb-1">Prix/unité (OR)</label>
            <input
              id="create-price"
              type="number"
              value={createPrice}
              onChange={(e) => setCreatePrice(e.target.value)}
              placeholder="2"
              min="0.01"
              step="0.01"
              className="w-24 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-zinc-500"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !createQty || !createPrice}
            className="px-4 py-2 rounded-lg bg-white text-zinc-950 font-semibold text-sm hover:bg-zinc-200 transition-colors disabled:opacity-40"
          >
            {creating ? "..." : "Mettre en vente"}
          </button>
        </form>
      </div>

      {/* Mes offres */}
      {myOffers.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Mes offres</h3>
          {myOffers.map((offer) => (
            <div key={offer.id} className="rounded-xl bg-zinc-800 border border-zinc-700 overflow-hidden">
              {/* Ligne principale */}
              <div className="p-4 flex items-start justify-between gap-4">
                <div>
                  <span className={`text-sm font-bold ${RESOURCE_COLORS[offer.resourceType] ?? "text-zinc-200"}`}>
                    {offer.resourceType}
                  </span>
                  <div className="text-white font-semibold mt-0.5">
                    {offer.quantityIn.toLocaleString()} u. · {offer.pricePerResource} OR/u.
                  </div>
                  <div className="text-zinc-500 text-xs">Total : {(offer.quantityIn * offer.pricePerResource).toLocaleString()} OR</div>
                  {remainingMap[offer.id] != null && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-400">
                      <span>⏱</span>
                      <span>Modifiable dans {formatSeconds(remainingMap[offer.id])}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => editing?.offerId === offer.id ? setEditing(null) : startEdit(offer)}
                    disabled={!!remainingMap[offer.id] && editing?.offerId !== offer.id}
                    className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {editing?.offerId === offer.id ? "Annuler" : "Modifier"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(offer.id)}
                    disabled={deletingId === offer.id || !!remainingMap[offer.id]}
                    className="px-3 py-1.5 rounded-lg bg-red-900 hover:bg-red-800 text-red-300 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {deletingId === offer.id ? "..." : "Supprimer"}
                  </button>
                </div>
              </div>

              {/* Formulaire d'édition inline */}
              {editing?.offerId === offer.id && (
                <form
                  onSubmit={handleUpdate}
                  className="border-t border-zinc-700 bg-zinc-900 px-4 py-3 flex flex-wrap gap-2 items-end"
                >
                  <div>
                    <label htmlFor={`edit-resource-${offer.id}`} className="block text-xs text-zinc-500 mb-1">Ressource</label>
                    <select
                      id={`edit-resource-${offer.id}`}
                      value={editing.resourceType}
                      onChange={(e) => setEditing((prev) => prev ? { ...prev, resourceType: e.target.value as ResourceType } : prev)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-zinc-500"
                    >
                      <option value="FERONIUM">FERONIUM</option>
                      <option value="BOISIUM">BOISIUM</option>
                      <option value="CHARBONIUM">CHARBONIUM</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`edit-qty-${offer.id}`} className="block text-xs text-zinc-500 mb-1">Quantité</label>
                    <input
                      id={`edit-qty-${offer.id}`}
                      type="number"
                      min="1"
                      value={editing.qty}
                      onChange={(e) => setEditing((prev) => prev ? { ...prev, qty: e.target.value } : prev)}
                      className="w-28 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit-price-${offer.id}`} className="block text-xs text-zinc-500 mb-1">Prix/unité (OR)</label>
                    <input
                      id={`edit-price-${offer.id}`}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={editing.price}
                      onChange={(e) => setEditing((prev) => prev ? { ...prev, price: e.target.value } : prev)}
                      className="w-24 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={updating || !editing.qty || !editing.price}
                    className="px-4 py-1.5 rounded-lg bg-white text-zinc-950 font-semibold text-sm hover:bg-zinc-200 transition-colors disabled:opacity-40"
                  >
                    {updating ? "..." : "Enregistrer"}
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Offres disponibles */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
          Offres disponibles ({othersOffers.length})
        </h3>
        {othersOffers.length === 0 && (
          <div className="text-center text-zinc-500 text-sm py-6">
            Aucune offre en ce moment
          </div>
        )}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {othersOffers.map((offer) => (
            <div
              key={offer.id}
              className="rounded-xl bg-zinc-800 border border-zinc-700 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-bold ${RESOURCE_COLORS[offer.resourceType] ?? "text-zinc-200"}`}>
                      {offer.resourceType}
                    </span>
                    <span className="text-xs text-zinc-500">par {offer.owner.name}</span>
                  </div>
                  <div className="text-white font-semibold">
                    {offer.quantityIn.toLocaleString()} u. · {offer.pricePerResource} OR/u.
                  </div>
                  <div className="text-zinc-500 text-xs mt-0.5">
                    Total max : {(offer.quantityIn * offer.pricePerResource).toLocaleString()} OR
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    min="1"
                    max={offer.quantityIn}
                    value={buyQty[offer.id] ?? offer.quantityIn}
                    onChange={(e) => setBuyQty((prev) => ({ ...prev, [offer.id]: Number.parseInt(e.target.value, 10) }))}
                    className="w-24 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-sm text-right focus:outline-none focus:border-zinc-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleBuy(offer)}
                    disabled={buyingId === offer.id}
                    className="px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors disabled:opacity-40"
                  >
                    {buyingId === offer.id ? "..." : "Acheter"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
