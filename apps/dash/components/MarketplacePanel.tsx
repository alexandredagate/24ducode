"use client";

import { useEffect, useState } from "react";
import type { MarketOffer, ResourceType } from "../hooks/useSocket";

const COOLDOWN_MS = 5 * 60 * 1000;
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

const RESOURCE_META: Record<string, { color: string; label: string; accent: string; bg: string; border: string }> = {
  FERONIUM: { color: "text-cyan-400", label: "Feronium", accent: "card-accent-cyan", bg: "rgba(0,229,255,0.04)", border: "rgba(0,229,255,0.12)" },
  BOISIUM: { color: "text-emerald-400", label: "Boisium", accent: "card-accent-emerald", bg: "rgba(52,211,153,0.04)", border: "rgba(52,211,153,0.12)" },
  CHARBONIUM: { color: "text-orange-400", label: "Charbonium", accent: "card-accent-orange", bg: "rgba(249,115,22,0.04)", border: "rgba(249,115,22,0.12)" },
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
      setMessage(`Achat de ${qty} ${offer.resourceType} effectue.`);
      onRefresh();
    } catch (err) {
      setMessage(`Erreur: ${err instanceof Error ? err.message : "inconnue"}`);
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
      setMessage(`Offre modifiee : ${qty} ${editing.resourceType} a ${price} OR/u.`);
      setEditing(null);
      onRefresh();
    } catch (err) {
      setMessage(`Erreur: ${err instanceof Error ? err.message : "inconnue"}`);
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
      setMessage("Offre supprimee.");
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
      setMessage(`Offre creee : ${qty} ${createResource} a ${price} OR/u.`);
      setCreateQty("");
      setCreatePrice("");
      onRefresh();
    } catch (err) {
      setMessage(`Erreur: ${err instanceof Error ? err.message : "inconnue"}`);
    } finally {
      setCreating(false);
    }
  }

  if (!marketplaceDiscovered) {
    return (
      <div className="card card-accent-purple p-10 text-center max-w-md mx-auto">
        <div className="text-4xl mb-3 opacity-40">🔒</div>
        <h2 className="text-base font-bold text-white mb-1">Marketplace verrouillee</h2>
        <p className="text-zinc-500 text-sm">
          Decouvrez et validez l'ile du Marche Central pour debloquer la marketplace.
        </p>
      </div>
    );
  }

  const totalOffers = offers.length;
  const totalVolume = othersOffers.reduce((s, o) => s + o.quantityIn * o.pricePerResource, 0);
  const cheapestByType: Record<string, number> = {};
  for (const o of othersOffers) {
    if (!cheapestByType[o.resourceType] || o.pricePerResource < cheapestByType[o.resourceType]) {
      cheapestByType[o.resourceType] = o.pricePerResource;
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
            style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.15)" }}>💰</span>
          Marche
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          className="px-4 py-2 rounded-xl text-xs font-medium btn-primary"
        >
          Actualiser
        </button>
      </div>

      {/* Market stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Offres totales</div>
          <div className="text-xl font-black text-white font-mono mt-1">{totalOffers}</div>
        </div>
        <div className="card p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Volume marche</div>
          <div className="text-xl font-black text-yellow-400 font-mono mt-1">{totalVolume.toLocaleString()}</div>
          <div className="text-[10px] text-zinc-600">OR</div>
        </div>
        {(["FERONIUM", "BOISIUM", "CHARBONIUM"] as ResourceType[]).map(r => {
          const meta = RESOURCE_META[r];
          return (
            <div key={r} className="card p-3">
              <div className={`text-[10px] uppercase tracking-wider ${meta?.color ?? "text-zinc-500"}`}>
                {meta?.label ?? r}
              </div>
              <div className="text-xl font-black text-white font-mono mt-1">
                {cheapestByType[r] != null ? `${cheapestByType[r]}` : "-"}
              </div>
              <div className="text-[10px] text-zinc-600">meilleur prix</div>
            </div>
          );
        })}
      </div>

      {message && (
        <div className="px-4 py-2.5 rounded-xl text-sm toast" style={{ background: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.1)", color: "#67e8f9" }}>
          {message}
        </div>
      )}

      {/* Create + My offers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Create offer */}
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Nouvelle offre</h3>
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-end">
            <div>
              <label htmlFor="create-resource" className="block text-[10px] text-zinc-500 mb-1">Ressource</label>
              <select
                id="create-resource"
                value={createResource}
                onChange={(e) => setCreateResource(e.target.value as ResourceType)}
                className="px-3 py-2 rounded-lg text-sm input-gaming"
              >
                <option value="FERONIUM">Feronium</option>
                <option value="BOISIUM">Boisium</option>
                <option value="CHARBONIUM">Charbonium</option>
              </select>
            </div>
            <div>
              <label htmlFor="create-qty" className="block text-[10px] text-zinc-500 mb-1">Quantite</label>
              <input
                id="create-qty"
                type="number"
                value={createQty}
                onChange={(e) => setCreateQty(e.target.value)}
                placeholder="1000"
                min="1"
                className="w-full sm:w-28 px-3 py-2 rounded-lg text-sm input-gaming"
              />
            </div>
            <div>
              <label htmlFor="create-price" className="block text-[10px] text-zinc-500 mb-1">Prix/u.</label>
              <input
                id="create-price"
                type="number"
                value={createPrice}
                onChange={(e) => setCreatePrice(e.target.value)}
                placeholder="2"
                min="0.01"
                step="0.01"
                className="w-full sm:w-24 px-3 py-2 rounded-lg text-sm input-gaming"
              />
            </div>
            <button
              type="submit"
              disabled={creating || !createQty || !createPrice}
              className="w-full sm:w-auto px-4 py-2 rounded-xl text-sm btn-gaming"
            >
              {creating ? "..." : "Vendre"}
            </button>
          </form>
        </div>

        {/* My offers */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Mes offres {myOffers.length > 0 && `(${myOffers.length})`}
          </h3>
          {myOffers.length === 0 ? (
            <div className="card p-4 text-center text-zinc-600 text-sm">
              Aucune offre en vente
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {myOffers.map((offer) => {
                const meta = RESOURCE_META[offer.resourceType];
                return (
                  <div key={offer.id} className="card overflow-hidden">
                    <div className="p-3 flex items-center justify-between gap-3">
                      <div>
                        <span className={`text-sm font-bold ${meta?.color ?? "text-zinc-200"}`}>
                          {meta?.label ?? offer.resourceType}
                        </span>
                        <div className="text-white font-semibold mt-0.5 font-mono text-sm">
                          {offer.quantityIn.toLocaleString()} u. · {offer.pricePerResource} OR/u.
                        </div>
                        {remainingMap[offer.id] != null && (
                          <div className="mt-1 text-[11px] text-amber-400 animate-glow-pulse font-mono">
                            {formatSeconds(remainingMap[offer.id])}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => editing?.offerId === offer.id ? setEditing(null) : startEdit(offer)}
                          disabled={!!remainingMap[offer.id] && editing?.offerId !== offer.id}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 hover:text-zinc-200"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                        >
                          {editing?.offerId === offer.id ? "Annuler" : "Modifier"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(offer.id)}
                          disabled={deletingId === offer.id || !!remainingMap[offer.id]}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium btn-gaming-red disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {deletingId === offer.id ? "..." : "Suppr."}
                        </button>
                      </div>
                    </div>

                    {editing?.offerId === offer.id && (
                      <form
                        onSubmit={handleUpdate}
                        className="px-3 py-2 flex flex-wrap gap-2 items-end"
                        style={{ borderTop: "1px solid rgba(255,255,255,0.04)", background: "rgba(0,0,0,0.15)" }}
                      >
                        <div>
                          <label htmlFor={`edit-resource-${offer.id}`} className="block text-[10px] text-zinc-500 mb-1">Ressource</label>
                          <select
                            id={`edit-resource-${offer.id}`}
                            value={editing.resourceType}
                            onChange={(e) => setEditing((prev) => prev ? { ...prev, resourceType: e.target.value as ResourceType } : prev)}
                            className="px-2 py-1 rounded-lg text-xs input-gaming"
                          >
                            <option value="FERONIUM">Feronium</option>
                            <option value="BOISIUM">Boisium</option>
                            <option value="CHARBONIUM">Charbonium</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`edit-qty-${offer.id}`} className="block text-[10px] text-zinc-500 mb-1">Qte</label>
                          <input
                            id={`edit-qty-${offer.id}`}
                            type="number"
                            min="1"
                            value={editing.qty}
                            onChange={(e) => setEditing((prev) => prev ? { ...prev, qty: e.target.value } : prev)}
                            className="w-20 px-2 py-1 rounded-lg text-xs input-gaming"
                          />
                        </div>
                        <div>
                          <label htmlFor={`edit-price-${offer.id}`} className="block text-[10px] text-zinc-500 mb-1">Prix/u.</label>
                          <input
                            id={`edit-price-${offer.id}`}
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={editing.price}
                            onChange={(e) => setEditing((prev) => prev ? { ...prev, price: e.target.value } : prev)}
                            className="w-20 px-2 py-1 rounded-lg text-xs input-gaming"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={updating || !editing.qty || !editing.price}
                          className="px-3 py-1 rounded-lg text-xs btn-gaming"
                        >
                          {updating ? "..." : "OK"}
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Available offers by resource */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          Offres disponibles ({othersOffers.length})
        </h3>
        {othersOffers.length === 0 ? (
          <div className="text-center text-zinc-600 text-sm py-8">
            Aucune offre en ce moment
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(["FERONIUM", "BOISIUM", "CHARBONIUM"] as ResourceType[]).map((resType) => {
              const resOffers = othersOffers.filter((o) => o.resourceType === resType).sort((a, b) => a.pricePerResource - b.pricePerResource);
              const meta = RESOURCE_META[resType];
              const bestPrice = resOffers.length > 0 ? resOffers[0].pricePerResource : null;
              return (
                <div key={resType} className={`card ${meta?.accent ?? ""} p-4`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`text-sm font-bold ${meta?.color ?? "text-zinc-200"}`}>{meta?.label ?? resType}</h4>
                    <span className="text-[10px] text-zinc-600">{resOffers.length} offres</span>
                  </div>
                  {resOffers.length === 0 ? (
                    <div className="text-xs text-zinc-700 text-center py-6">Aucune offre</div>
                  ) : (
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                      {resOffers.map((offer) => {
                        const isBest = offer.pricePerResource === bestPrice;
                        const qty = buyQty[offer.id] ?? offer.quantityIn;
                        const totalCost = qty * offer.pricePerResource;
                        return (
                          <div key={offer.id} className={`rounded-xl p-3 ${isBest ? "best-price" : ""}`}
                            style={{ background: isBest ? "rgba(52,211,153,0.03)" : "rgba(0,0,0,0.2)", border: `1px solid ${isBest ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.04)"}` }}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] text-zinc-500">{offer.owner.name}</span>
                              <span className={`text-[11px] font-mono font-semibold ${isBest ? "text-emerald-400" : "text-zinc-400"}`}>{offer.pricePerResource} OR/u.</span>
                            </div>
                            <div className="text-white font-semibold font-mono text-sm">
                              {offer.quantityIn.toLocaleString()} u.
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <input
                                type="number"
                                min="1"
                                max={offer.quantityIn}
                                value={qty}
                                onChange={(e) => setBuyQty((prev) => ({ ...prev, [offer.id]: Number.parseInt(e.target.value, 10) }))}
                                className="flex-1 min-w-0 px-2 py-1 rounded-lg text-xs text-right input-gaming"
                              />
                              <button
                                type="button"
                                onClick={() => handleBuy(offer)}
                                disabled={buyingId === offer.id}
                                className="shrink-0 px-3 py-1 rounded-lg text-xs font-semibold btn-gaming-emerald"
                              >
                                {buyingId === offer.id ? "..." : `${totalCost.toLocaleString()} OR`}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
