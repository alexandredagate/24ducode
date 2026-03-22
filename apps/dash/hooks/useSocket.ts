"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || "https://24ducode-api.fly.dev";

export type ResourceType = "FERONIUM" | "BOISIUM" | "CHARBONIUM";
export type Direction = "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW";
export type TaxStatus = "DUE" | "PAID";
export type TaxType = "RESCUE" | "CHEAT";

export interface PlayerDetails {
  id: string;
  name: string;
  quotient: number;
  money: number;
  resources: { quantity: number; type: ResourceType }[];
  home: { name: string; bonusQuotient: number };
  discoveredIslands: {
    island: { name: string; bonusQuotient: number };
    islandState: "KNOWN" | "DISCOVERED";
  }[];
  marketPlaceDiscovered: boolean;
}

// Données retournées par ship:next-level
export interface ShipNextLevel {
  availableMove?: number;
  level?: {
    id: number;
    name: string;
    visibilityRange: number;
    maxMovement: number;
    speed: number;
  };
  currentPosition?: { id: string; x: number; y: number; type: string; zone: number };
  costResources?: { FERONIUM: number; BOISIUM: number; CHARBONIUM: number };
}

export interface Tax {
  id: string;
  type: TaxType;
  state: TaxStatus;
  amount: number;
  remainingTime: number;
  player: { id: string; name: string };
}

export interface MarketOffer {
  id: string;
  owner: { name: string };
  resourceType: ResourceType;
  quantityIn: number;
  pricePerResource: number;
}

export interface StorageInfo {
  id: number;
  name: string;
  maxResources: { FERONIUM: number; BOISIUM: number; CHARBONIUM: number };
  costResources: { FERONIUM: number; BOISIUM: number; CHARBONIUM: number };
}

export interface MapGrid {
  grid: string[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export type TheftChance = "FAIBLE" | "MOYENNE" | "FORTE";
export type TheftStatus = "PENDING" | "SUCCESS" | "FAILURE";

export interface Theft {
  id: string;
  resourceType: ResourceType;
  amountAttempted: number;
  moneySpent: number;
  createdAt: string;
  resolveAt: string;
  status: string;
  chance: TheftChance;
}

export interface BrokerEvent {
  id: number;
  receivedAt: string;
  type: string;
  data: unknown;
}

interface SocketResponse<T = unknown> {
  command: string;
  status: "ok" | "error";
  data?: T;
  error?: string;
}

type PendingEntry = { resolve: (res: SocketResponse) => void; timeout: ReturnType<typeof setTimeout> };

interface UseSocketReturn {
  connected: boolean;
  authenticated: boolean;
  login: (codingGameId: string) => Promise<void>;
  logout: () => void;
  emit: <T = unknown>(command: string, payload?: object) => Promise<T>;
  playerDetails: PlayerDetails | null;
  shipNextLevel: ShipNextLevel | null;
  shipExists: boolean;
  shipLevelError: string | null;
  // Position et énergie mises à jour immédiatement après ship:move
  currentPosition: { x: number; y: number; type: string; zone: number } | null;
  availableMove: number | null;
  taxes: Tax[];
  marketOffers: MarketOffer[];
  thefts: Theft[];
  storageInfo: StorageInfo | null;
  mapGrid: MapGrid | null;
  refreshMapGrid: () => Promise<void>;
  brokerEvents: BrokerEvent[];
  clearBrokerEvents: () => void;
  refreshAll: () => void;
  lastError: string | null;
}

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  // Map command → pending entry. Déduplication : si déjà en attente, on ignore la nouvelle requête.
  const pendingRef = useRef<Map<string, PendingEntry>>(new Map());

  const [connected, setConnected] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [playerDetails, setPlayerDetails] = useState<PlayerDetails | null>(null);
  const [shipNextLevel, setShipNextLevel] = useState<ShipNextLevel | null>(null);
  const [shipExists, setShipExists] = useState(false);
  const [shipLevelError, setShipLevelError] = useState<string | null>(null);
  const [currentPosition, setCurrentPosition] = useState<{ x: number; y: number; type: string; zone: number } | null>(null);
  const [availableMove, setAvailableMove] = useState<number | null>(null);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [marketOffers, setMarketOffers] = useState<MarketOffer[]>([]);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [mapGrid, setMapGrid] = useState<MapGrid | null>(null);
  const [thefts, setThefts] = useState<Theft[]>([]);
  const [brokerEvents, setBrokerEvents] = useState<BrokerEvent[]>([]);
  const brokerIdRef = useRef(0);
  const [lastError, setLastError] = useState<string | null>(null);

  // Refs stables pour les callbacks utilisés dans useEffect sans les mettre en deps
  const setShipNextLevelRef = useRef(setShipNextLevel);
  const setShipExistsRef = useRef(setShipExists);
  const setShipLevelErrorRef = useRef(setShipLevelError);
  const setCurrentPositionRef = useRef(setCurrentPosition);
  const setAvailableMoveRef = useRef(setAvailableMove);

  // Routeur central : un seul handler "response" sur le socket
  const setupResponseRouter = useCallback((socket: Socket) => {
    socket.on("response", (res: SocketResponse) => {
      const entry = pendingRef.current.get(res.command);
      if (entry) {
        clearTimeout(entry.timeout);
        pendingRef.current.delete(res.command);
        entry.resolve(res);
      }
    });
  }, []);

  const emitRaw = useCallback(<T = unknown>(
    socket: Socket,
    command: string,
    payload?: object
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      // Déduplication : si la commande est déjà en attente, on ignore
      if (pendingRef.current.has(command)) {
        reject(new Error(`${command} already pending`));
        return;
      }

      const timeout = setTimeout(() => {
        pendingRef.current.delete(command);
        reject(new Error(`Timeout: ${command}`));
      }, 10000);

      pendingRef.current.set(command, {
        timeout,
        resolve: (res: SocketResponse) => {
          if (res.status === "ok") {
            resolve(res.data as T);
          } else {
            reject(new Error(res.error ?? "Erreur inconnue"));
          }
        },
      });

      socket.emit("message", { command, payload });
    });
  }, []);

  const emit = useCallback(<T = unknown>(command: string, payload?: object): Promise<T> => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      return Promise.reject(new Error("Socket non connecté"));
    }
    return emitRaw<T>(socket, command, payload);
  }, [emitRaw]);

  const refreshShipNextLevel = useCallback(async () => {
    try {
      const raw = await emit<Record<string, unknown>>("ship:next-level");
      console.log("[ship:next-level] response:", JSON.stringify(raw));

      // L'API peut retourner soit { level: {...}, costResources, ... }
      // soit le level directement à la racine { id, name, ..., costResources }
      let data: ShipNextLevel;
      if (raw.level && typeof raw.level === "object") {
        data = raw as unknown as ShipNextLevel;
      } else if (raw.id && raw.name) {
        // Format plat : les champs du level sont à la racine
        const { costResources, availableMove, currentPosition, ...levelFields } = raw;
        data = {
          level: levelFields as unknown as ShipNextLevel["level"],
          costResources: costResources as ShipNextLevel["costResources"],
          availableMove: availableMove as number | undefined,
          currentPosition: currentPosition as ShipNextLevel["currentPosition"],
        };
      } else {
        data = raw as unknown as ShipNextLevel;
      }

      setShipNextLevelRef.current(data);
      setShipExistsRef.current(true);
      setShipLevelErrorRef.current(null);
      if (data.currentPosition) {
        setCurrentPositionRef.current(data.currentPosition);
      }
      if (data.availableMove != null) {
        setAvailableMoveRef.current(data.availableMove);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      console.warn("[ship:next-level] error:", msg);
      // "already pending" est ignoré silencieusement (déduplication normale)
      if (!msg.includes("already pending")) {
        setShipExistsRef.current(true);
        setShipLevelErrorRef.current(msg);
      }
    }
  }, [emit]);

  const refreshPlayerDetails = useCallback(async () => {
    try {
      const data = await emit<PlayerDetails>("player:details");
      setPlayerDetails(data);
    } catch {}
  }, [emit]);

  const refreshTaxes = useCallback(async () => {
    try {
      const data = await emit<Tax[]>("tax:list");
      setTaxes(data ?? []);
    } catch {}
  }, [emit]);

  const refreshMarketOffers = useCallback(async () => {
    try {
      const data = await emit<MarketOffer[]>("marketplace:offers");
      setMarketOffers(data ?? []);
    } catch {}
  }, [emit]);

  const refreshStorageInfo = useCallback(async () => {
    try {
      const data = await emit<StorageInfo>("storage:next-level");
      setStorageInfo(data);
    } catch {}
  }, [emit]);

  const refreshMapGrid = useCallback(async () => {
    try {
      const data = await emit<MapGrid>("map:grid");
      setMapGrid(data);
    } catch {}
  }, [emit]);
  
  const refreshThefts = useCallback(async () => {
    try {
      const data = await emit<Theft[]>("theft:list");
      setThefts(data ?? []);
    } catch {}
  }, [emit]);

  const refreshShipLocation = useCallback(async () => {
    try {
      const data = await emit<{ position: { id: string; x: number; y: number; type: string; zone: number }; energy: number }>("ship:location");
      if (data.position) {
        setCurrentPositionRef.current(data.position);
      }
      if (data.energy != null) {
        setAvailableMoveRef.current(data.energy);
      }
    } catch {}
  }, [emit]);

  // Sequential pour éviter les conflits de commandes simultanées
  const refreshAll = useCallback(async () => {
    await refreshPlayerDetails();
    await refreshShipNextLevel();
    await refreshShipLocation();
    await refreshTaxes();
    await refreshMarketOffers();
    await refreshStorageInfo();
    await refreshMapGrid();
    await refreshThefts();

  }, [refreshPlayerDetails, refreshShipNextLevel, refreshShipLocation, refreshTaxes, refreshMarketOffers, refreshStorageInfo, refreshMapGrid, refreshThefts]);

  // Refs stables pour les fonctions de refresh utilisées dans useEffect
  const refreshShipNextLevelRef = useRef(refreshShipNextLevel);
  const refreshPlayerDetailsRef = useRef(refreshPlayerDetails);
  const refreshMarketOffersRef = useRef(refreshMarketOffers);
  const refreshStorageInfoRef = useRef(refreshStorageInfo);
  const refreshTaxesRef = useRef(refreshTaxes);
  const refreshShipLocationRef = useRef(refreshShipLocation);
  const refreshMapGridRef = useRef(refreshMapGrid);
  useEffect(() => {
    refreshShipNextLevelRef.current = refreshShipNextLevel;
    refreshPlayerDetailsRef.current = refreshPlayerDetails;
    refreshMarketOffersRef.current = refreshMarketOffers;
    refreshStorageInfoRef.current = refreshStorageInfo;
    refreshTaxesRef.current = refreshTaxes;
    refreshShipLocationRef.current = refreshShipLocation;
    refreshMapGridRef.current = refreshMapGrid;
  }, [refreshShipNextLevel, refreshPlayerDetails, refreshMarketOffers, refreshStorageInfo, refreshTaxes, refreshShipLocation, refreshMapGrid]);

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    setupResponseRouter(socket);

    const pushEvent = (type: string, data: unknown) => {
      setBrokerEvents((prev) => [
        { id: brokerIdRef.current++, receivedAt: new Date().toISOString(), type, data },
        ...prev,
      ].slice(0, 200));
    };

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => {
      setConnected(false);
      setAuthenticated(false);
      // Vider les pending pour éviter les timeouts orphelins
      for (const entry of pendingRef.current.values()) clearTimeout(entry.timeout);
      pendingRef.current.clear();
    });

    // map:update → données de grille reçues en broadcast après chaque ship:move
    // Format serveur : { command: "map:update", status: "ok", data: { grid, minX, maxX, minY, maxY, width, height } }
    socket.on("map:update", (raw: unknown) => {
      console.log("[map:update] received:", raw);
      if (raw != null && typeof raw === "object") {
        const obj = raw as Record<string, unknown>;
        const mapData = (obj.data && typeof obj.data === "object" ? obj.data : obj) as Record<string, unknown>;
        if (mapData.grid) {
          setMapGrid(mapData as unknown as MapGrid);
        }
      }
      refreshShipNextLevelRef.current();
      refreshPlayerDetailsRef.current();
      pushEvent("MAP_UPDATE", raw);
    });

    // ship:position → position + énergie en temps réel après chaque ship:move
    // Format serveur : { position: { id, x, y, type, zone }, energy: number }
    socket.on("ship:position", (data: unknown) => {
      console.log("[ship:position] received:", data);
      if (data != null && typeof data === "object") {
        const obj = data as Record<string, unknown>;
        const pos = obj.position as { x: number; y: number; type: string; zone: number } | undefined;
        if (pos) setCurrentPositionRef.current(pos);
        if (typeof obj.energy === "number") setAvailableMoveRef.current(obj.energy);
      }
      pushEvent("SHIP_POSITION", data);
    });

    // broker:event → AMQP events from the game server
    // Déclenche des refreshs ciblés selon le type d'event
    socket.on("broker:event", (msg: unknown) => {
      console.log("[broker:event] raw:", msg);
      let type = "BROKER";
      if (msg != null && typeof msg === "object" && !Array.isArray(msg)) {
        const obj = msg as Record<string, unknown>;
        type = typeof obj.type === "string" ? obj.type : "BROKER";
        pushEvent(type, obj.data ?? obj);
      } else {
        pushEvent("BROKER", msg);
      }

      // Refresh réactif ciblé selon le type d'événement
      switch (type) {
        case "OFFER_CREATED":
        case "OFFER_UPDATED":
        case "OFFER_DELETED":
        case "OFFER_PURCHASED":
          refreshMarketOffersRef.current();
          refreshPlayerDetailsRef.current();
          break;
        case "THEFT_RESOLVED":
        case "THEFT_CREATED":
          refreshPlayerDetailsRef.current();
          refreshStorageInfoRef.current();
          break;
        case "TAX_CREATED":
        case "TAX_PAID":
        case "TAX_EXPIRED":
          refreshTaxesRef.current();
          refreshPlayerDetailsRef.current();
          break;
        case "ISLAND_DISCOVERED":
          refreshPlayerDetailsRef.current();
          refreshMapGridRef.current();
          break;
        default:
          // Event inconnu → refresh player par sécurité
          if (type !== "BROKER" && type !== "MAP_UPDATE" && type !== "SHIP_POSITION") {
            refreshPlayerDetailsRef.current();
          }
          break;
      }
    });

    // Auto-refresh du token si déjà connecté
    const storedRefreshToken = localStorage.getItem("refreshToken");
    if (storedRefreshToken) {
      socket.once("connect", async () => {
        try {
          const data = await emitRaw<{ accessToken: string; refreshToken: string }>(
            socket,
            "auth:refresh",
            { refreshToken: storedRefreshToken }
          );
          localStorage.setItem("accessToken", data.accessToken);
          localStorage.setItem("refreshToken", data.refreshToken);
          setAuthenticated(true);
        } catch {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
        }
      });
    }

    return () => {
      for (const entry of pendingRef.current.values()) clearTimeout(entry.timeout);
      pendingRef.current.clear();
      socket.disconnect();
    };
  }, [setupResponseRouter, emitRaw]); // Plus de refreshShipNextLevel dans les deps !

  useEffect(() => {
    if (authenticated) {
      refreshAll();
    }
  }, [authenticated, refreshAll]);

  const login = useCallback(async (pin: string) => {
    const socket = socketRef.current;
    if (!socket) throw new Error("Socket non initialisé");
    const data = await emitRaw<{ accessToken: string; refreshToken: string }>(
      socket,
      "auth:login",
      { pin }
    );
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    setAuthenticated(true);
    setLastError(null);
  }, [emitRaw]);

  const logout = useCallback(() => {
    socketRef.current?.emit("message", { command: "auth:logout" });
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    setAuthenticated(false);
    setPlayerDetails(null);
    setShipNextLevel(null);
    setShipExists(false);
    setShipLevelError(null);
    setCurrentPosition(null);
    setAvailableMove(null);
    setTaxes([]);
    setMarketOffers([]);
    setThefts([]);
    setStorageInfo(null);
    setMapGrid(null);
    setBrokerEvents([]);
    for (const entry of pendingRef.current.values()) clearTimeout(entry.timeout);
    pendingRef.current.clear();
  }, []);

  return {
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
    brokerEvents,
    clearBrokerEvents: useCallback(() => setBrokerEvents([]), []),
    storageInfo,
    mapGrid,
    refreshMapGrid,
    refreshAll,
    lastError,
  };
}
