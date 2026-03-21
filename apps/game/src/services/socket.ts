import { io, type Socket } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

// ─── Types ───────────────────────────────────────────────

export type Direction = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';

export interface MapGridData {
  grid: string[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export interface SocketResponse {
  command: string;
  status: 'ok' | 'error';
  data?: unknown;
  error?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface Resource {
  quantity: number;
  type: string;
}

export interface PlayerDetails {
  id: string;
  name: string;
  quotient: number;
  money: number;
  resources: Resource[];
  home: { name: string; bonusQuotient: number };
  discoveredIslands: { island: { name: string; bonusQuotient: number }; islandState: string }[];
  marketPlaceDiscovered: boolean;
}

export interface CellInfo {
  id: string;
  x: number;
  y: number;
  type: string;
  zone: number;
}

export interface MoveResult {
  discoveredCells: CellInfo[];
  position: CellInfo;
  energy: number;
}

export interface ShipLevelInfo {
  availableMove: number;
  level: { id: number; name: string; visibilityRange: number; maxMovement: number; speed: number };
  currentPosition: CellInfo;
  costResources: Record<string, number>;
}

export interface Tax {
  id: string;
  type: string;
  state: string;
  amount: number;
  remainingTime: number;
  player: { id: string; name: string };
}

export interface StorageInfo {
  id: number;
  name: string;
  maxResources: Record<string, number>;
  costResources: Record<string, number>;
}

export interface Offer {
  id: string;
  owner: { name: string };
  resourceType: string;
  quantityIn: number;
  pricePerResource: number;
}

export interface Theft {
  id: string;
  resourceType: string;
  amountAttempted: number;
  moneySpent: number;
  createdAt: string;
  resolveAt: string;
  status: string;
  chance: string;
}

// ─── State ───────────────────────────────────────────────

let socket: Socket | null = null;
let accessToken: string | null = null;
let refreshToken: string | null = null;
let mapMeta: { minX: number; maxX: number; minY: number; maxY: number } | null = null;

export type MapUpdateCallback = (data: MapGridData) => void;
export type BrokerEventCallback = (data: unknown) => void;

const mapUpdateListeners: MapUpdateCallback[] = [];
const brokerEventListeners: BrokerEventCallback[] = [];

// ─── Connection ──────────────────────────────────────────

export function connect(): Socket {
  if (socket) return socket;

  socket = io(SERVER_URL, { transports: ['websocket'] });

  socket.on('connect', () => {
    console.log('[socket] connected');
  });

  socket.on('disconnect', (reason) => {
    console.log('[socket] disconnected:', reason);
  });

  socket.on('map:update', (data: SocketResponse) => {
    if (data.status === 'ok' && data.data) {
      const mapData = data.data as MapGridData;
      for (const cb of mapUpdateListeners) cb(mapData);
    }
  });

  socket.on('broker:event', (data: unknown) => {
    for (const cb of brokerEventListeners) cb(data);
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

// ─── Event listeners ─────────────────────────────────────

export function onMapUpdate(cb: MapUpdateCallback): () => void {
  mapUpdateListeners.push(cb);
  return () => {
    const idx = mapUpdateListeners.indexOf(cb);
    if (idx >= 0) mapUpdateListeners.splice(idx, 1);
  };
}

export function onBrokerEvent(cb: BrokerEventCallback): () => void {
  brokerEventListeners.push(cb);
  return () => {
    const idx = brokerEventListeners.indexOf(cb);
    if (idx >= 0) brokerEventListeners.splice(idx, 1);
  };
}

// ─── Generic command sender ──────────────────────────────

function sendCommand<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error('Socket not connected'));
      return;
    }

    const handler = (response: SocketResponse) => {
      if (response.command !== command) return;
      socket!.off('response', handler);

      if (response.status === 'ok') {
        resolve(response.data as T);
      } else {
        reject(new Error(response.error ?? `${command} failed`));
      }
    };

    socket.on('response', handler);
    socket.emit('message', payload ? { command, payload } : { command });
  });
}

// ─── Map metadata ────────────────────────────────────────

export function getMapMeta() {
  return mapMeta;
}

// ─── Auth ────────────────────────────────────────────────

export async function login(codingGameId: string): Promise<AuthTokens> {
  const tokens = await sendCommand<AuthTokens>('auth:login', { codingGameId });
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  return tokens;
}

export async function refreshAuth(): Promise<AuthTokens> {
  if (!refreshToken) throw new Error('No refresh token');
  const tokens = await sendCommand<AuthTokens>('auth:refresh', { refreshToken });
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  return tokens;
}

export function logout(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  return sendCommand<void>('auth:logout');
}

export function isAuthenticated(): boolean {
  return accessToken !== null;
}

// ─── Player ──────────────────────────────────────────────

export function getPlayerDetails(): Promise<PlayerDetails> {
  return sendCommand<PlayerDetails>('player:details');
}

export function getPlayerResources(): Promise<Resource[]> {
  return sendCommand<Resource[]>('player:resources');
}

// ─── Ship ────────────────────────────────────────────────

export function buildShip(): Promise<{ shipId: string }> {
  return sendCommand<{ shipId: string }>('ship:build');
}

export function moveShip(direction: Direction): Promise<MoveResult> {
  return sendCommand<MoveResult>('ship:move', { direction });
}

export function getShipNextLevel(): Promise<ShipLevelInfo> {
  return sendCommand<ShipLevelInfo>('ship:next-level');
}

export function upgradeShip(level: number): Promise<void> {
  return sendCommand<void>('ship:upgrade', { level });
}

// ─── Tax ─────────────────────────────────────────────────

export function getTaxes(status?: string): Promise<Tax[]> {
  return sendCommand<Tax[]>('tax:list', status ? { status } : undefined);
}

export function payTax(taxId: string): Promise<void> {
  return sendCommand<void>('tax:pay', { taxId });
}

// ─── Storage ─────────────────────────────────────────────

export function getStorageNextLevel(): Promise<StorageInfo> {
  return sendCommand<StorageInfo>('storage:next-level');
}

export function upgradeStorage(): Promise<StorageInfo> {
  return sendCommand<StorageInfo>('storage:upgrade');
}

// ─── Marketplace ─────────────────────────────────────────

export function getMarketplaceOffers(): Promise<Offer[]> {
  return sendCommand<Offer[]>('marketplace:offers');
}

export function getMarketplaceOffer(offerId: string): Promise<Offer> {
  return sendCommand<Offer>('marketplace:offer', { offerId });
}

export function createMarketplaceOffer(resourceType: string, quantityIn: number, pricePerResource: number): Promise<Offer> {
  return sendCommand<Offer>('marketplace:create-offer', { resourceType, quantityIn, pricePerResource });
}

export function updateMarketplaceOffer(offerId: string, resourceType: string, quantityIn: number, pricePerResource: number): Promise<Offer> {
  return sendCommand<Offer>('marketplace:update-offer', { offerId, resourceType, quantityIn, pricePerResource });
}

export function deleteMarketplaceOffer(offerId: string): Promise<void> {
  return sendCommand<void>('marketplace:delete-offer', { offerId });
}

export function purchaseMarketplaceOffer(offerId: string, quantity: number): Promise<void> {
  return sendCommand<void>('marketplace:purchase', { offerId, quantity });
}

// ─── Theft ───────────────────────────────────────────────

export function getThefts(): Promise<Theft[]> {
  return sendCommand<Theft[]>('theft:list');
}

export function attackTheft(resourceType: string, moneySpent: number): Promise<Theft> {
  return sendCommand<Theft>('theft:attack', { resourceType, moneySpent });
}

// ─── Map ─────────────────────────────────────────────────

export async function requestMapGrid(): Promise<MapGridData> {
  const data = await sendCommand<MapGridData>('map:grid');
  mapMeta = { minX: data.minX, maxX: data.maxX, minY: data.minY, maxY: data.maxY };
  return data;
}
