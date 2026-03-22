import { io, type Socket } from 'socket.io-client';

const SERVER_URL = 'https://24ducode-api.fly.dev';

export type Direction = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';
export type ResourceType = 'FERONIUM' | 'BOISIUM' | 'CHARBONIUM';

export interface Cell {
  id: string;
  x: number;
  y: number;
  type: 'SEA' | 'SAND';
  zone: number;
}

export interface Resource {
  quantity: number;
  type: ResourceType;
}

export interface PriceResources {
  FERONIUM: number;
  BOISIUM: number;
  CHARBONIUM: number;
}

export interface Island {
  name: string;
  bonusQuotient: number;
}

export interface DiscoveredIsland {
  island: Island;
  islandState: 'KNOWN' | 'DISCOVERED';
}

export interface PlayerDetails {
  id: string;
  signUpCode: string;
  name: string;
  quotient: number;
  money: number;
  resources: Resource[];
  home: Island;
  discoveredIslands: DiscoveredIsland[];
  marketPlaceDiscovered: boolean;
}

export interface ShipLevel {
  id: number;
  name: string;
  visibilityRange: number;
  maxMovement: number;
  speed: number;
}

export interface Ship {
  availableMove: number;
  level: ShipLevel;
  currentPosition: Cell;
  playerName?: string;
  costResources?: PriceResources;
}

export interface ShipMoveResponse {
  discoveredCells: Cell[];
  position: Cell;
  energy: number;
}

export interface ShipBuildResponse {
  shipId: string;
}

export interface ShipLocationResponse {
  position: Cell;
  energy: number;
}

export interface Taxe {
  id: string;
  type: 'RESCUE' | 'CHEAT';
  state: 'DUE' | 'PAID';
  amount: number;
  remainingTime: number;
  player: { id: string; name: string };
}

export interface Storage {
  id: number;
  name: string;
  maxResources: PriceResources;
  costResources: PriceResources;
}

export interface Offer {
  id: string;
  owner: { name: string };
  resourceType: ResourceType;
  quantityIn: number;
  pricePerResource: number;
}

export interface Theft {
  id: string;
  resourceType: ResourceType;
  amountAttempted: number;
  moneySpent: number;
  createdAt: string;
  resolveAt: string;
  status: string;
  chance: 'FAIBLE' | 'MOYENNE' | 'FORTE';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface MapGridData {
  grid: string[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  confirmedRefuel?: { x: number; y: number }[];
}

export interface MapMeta {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface SocketResponse {
  command: string;
  status: 'ok' | 'error';
  data?: unknown;
  error?: string;
}

let socket: Socket | null = null;
let accessToken: string | null = null;
let refreshToken: string | null = null;
let mapMeta: MapMeta | null = null;

export type MapUpdateCallback = (data: MapGridData) => void;
export type BrokerEventCallback = (data: unknown) => void;
export type ShipPositionCallback = (data: ShipLocationResponse) => void;

const mapUpdateListeners: MapUpdateCallback[] = [];
const brokerEventListeners: BrokerEventCallback[] = [];
const shipPositionListeners: ShipPositionCallback[] = [];

export function connect(): Socket {
  if (socket) return socket;

  socket = io(SERVER_URL, { transports: ['websocket'] });

  socket.on('map:update', (data: SocketResponse) => {
    if (data.status === 'ok' && data.data) {
      const gridData = data.data as MapGridData;
      for (const cb of mapUpdateListeners) cb(gridData);
    }
  });

  socket.on('ship:position', (data: ShipLocationResponse) => {
    for (const cb of shipPositionListeners) cb(data);
  });

  socket.on('broker:event', (data: unknown) => {
    for (const cb of brokerEventListeners) cb(data);
  });

  return socket;
}

export function onMapUpdate(cb: MapUpdateCallback): () => void {
  mapUpdateListeners.push(cb);
  return () => { const i = mapUpdateListeners.indexOf(cb); if (i >= 0) mapUpdateListeners.splice(i, 1); };
}

export function onShipPosition(cb: ShipPositionCallback): () => void {
  shipPositionListeners.push(cb);
  return () => { const i = shipPositionListeners.indexOf(cb); if (i >= 0) shipPositionListeners.splice(i, 1); };
}

export function onBrokerEvent(cb: BrokerEventCallback): () => void {
  brokerEventListeners.push(cb);
  return () => { const i = brokerEventListeners.indexOf(cb); if (i >= 0) brokerEventListeners.splice(i, 1); };
}

function sendCommand<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket) { reject(new Error('Socket not connected')); return; }

    const timeout = setTimeout(() => {
      socket!.off('response', handler);
      reject(new Error(`${command} timed out`));
    }, 10_000);

    const handler = (response: SocketResponse) => {
      if (response.command !== command) return;
      socket!.off('response', handler);
      clearTimeout(timeout);

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

export function getMapMeta(): MapMeta | null {
  return mapMeta;
}

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

export function getPlayerDetails(): Promise<PlayerDetails> {
  return sendCommand<PlayerDetails>('player:details');
}

export function getPlayerResources(): Promise<Resource[]> {
  return sendCommand<Resource[]>('player:resources');
}

export function buildShip(): Promise<ShipBuildResponse> {
  return sendCommand<ShipBuildResponse>('ship:build');
}

export function moveShip(direction: Direction): Promise<ShipMoveResponse> {
  return sendCommand<ShipMoveResponse>('ship:move', { direction });
}

export function getShipLocation(): Promise<ShipLocationResponse> {
  return sendCommand<ShipLocationResponse>('ship:location');
}

export function getShipNextLevel(): Promise<Ship> {
  return sendCommand<Ship>('ship:next-level');
}

export function upgradeShip(level: number): Promise<void> {
  return sendCommand<void>('ship:upgrade', { level });
}

export function getTaxes(status?: string): Promise<Taxe[]> {
  return sendCommand<Taxe[]>('tax:list', status ? { status } : undefined);
}

export function payTax(taxId: string): Promise<void> {
  return sendCommand<void>('tax:pay', { taxId });
}

export function getStorageNextLevel(): Promise<Storage> {
  return sendCommand<Storage>('storage:next-level');
}

export function upgradeStorage(): Promise<Storage> {
  return sendCommand<Storage>('storage:upgrade');
}

export function getMarketplaceOffers(): Promise<Offer[]> {
  return sendCommand<Offer[]>('marketplace:offers');
}

export function getMarketplaceOffer(offerId: string): Promise<Offer> {
  return sendCommand<Offer>('marketplace:offer', { offerId });
}

export function createMarketplaceOffer(resourceType: ResourceType, quantityIn: number, pricePerResource: number): Promise<Offer> {
  return sendCommand<Offer>('marketplace:create-offer', { resourceType, quantityIn, pricePerResource });
}

export function updateMarketplaceOffer(offerId: string, resourceType: ResourceType, quantityIn: number, pricePerResource: number): Promise<Offer> {
  return sendCommand<Offer>('marketplace:update-offer', { offerId, resourceType, quantityIn, pricePerResource });
}

export function deleteMarketplaceOffer(offerId: string): Promise<void> {
  return sendCommand<void>('marketplace:delete-offer', { offerId });
}

export function purchaseMarketplaceOffer(offerId: string, quantity: number): Promise<void> {
  return sendCommand<void>('marketplace:purchase', { offerId, quantity });
}

export function getThefts(): Promise<Theft[]> {
  return sendCommand<Theft[]>('theft:list');
}

export function attackTheft(resourceType: ResourceType, moneySpent: number): Promise<Theft> {
  return sendCommand<Theft>('theft:attack', { resourceType, moneySpent });
}

export async function requestMapGrid(): Promise<MapGridData> {
  const data = await sendCommand<MapGridData>('map:grid');
  mapMeta = { minX: data.minX, maxX: data.maxX, minY: data.minY, maxY: data.maxY };
  return data;
}
