"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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
  storageInfo: StorageInfo | null;
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
      const data = await emit<ShipNextLevel>("ship:next-level");
      setShipNextLevelRef.current(data);
      setShipExistsRef.current(true);
      setShipLevelErrorRef.current(null);
      // Mettre à jour position et énergie depuis ship:next-level
      if (data.currentPosition) {
        setCurrentPositionRef.current(data.currentPosition);
      }
      if (data.availableMove != null) {
        setAvailableMoveRef.current(data.availableMove);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      // "already pending" est ignoré silencieusement (déduplication normale)
      if (!msg.includes("already pending") && !msg.includes("Timeout")) {
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

  // Sequential pour éviter les conflits de commandes simultanées
  const refreshAll = useCallback(async () => {
    await refreshPlayerDetails();
    await refreshShipNextLevel();
    await refreshTaxes();
    await refreshMarketOffers();
    await refreshStorageInfo();
  }, [refreshPlayerDetails, refreshShipNextLevel, refreshTaxes, refreshMarketOffers, refreshStorageInfo]);

  // Ref stable pour refreshShipNextLevel utilisée dans useEffect
  const refreshShipNextLevelRef = useRef(refreshShipNextLevel);
  useEffect(() => {
    refreshShipNextLevelRef.current = refreshShipNextLevel;
  }, [refreshShipNextLevel]);

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

    // map:update → refresh ship via la ref stable (pas de race condition)
    socket.on("map:update", (data: unknown) => {
      refreshShipNextLevelRef.current();
      pushEvent("MAP_UPDATE", data);
    });

    // ship:position → track position broadcasts
    socket.on("ship:position", (data: unknown) => {
      pushEvent("SHIP_POSITION", data);
    });

    // broker:event → AMQP events from the game server
    socket.on("broker:event", (msg: { type?: string; data?: unknown }) => {
      pushEvent(msg.type ?? "BROKER", msg.data ?? msg);
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
      const interval = setInterval(refreshAll, 30000);
      return () => clearInterval(interval);
    }
  }, [authenticated, refreshAll]);

  const login = useCallback(async (codingGameId: string) => {
    const socket = socketRef.current;
    if (!socket) throw new Error("Socket non initialisé");
    const data = await emitRaw<{ accessToken: string; refreshToken: string }>(
      socket,
      "auth:login",
      { codingGameId }
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
    setStorageInfo(null);
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
    brokerEvents,
    clearBrokerEvents: useCallback(() => setBrokerEvents([]), []),
    storageInfo,
    refreshAll,
    lastError,
  };
}
