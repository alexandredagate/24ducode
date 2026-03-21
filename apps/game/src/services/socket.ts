import { io, type Socket } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

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

export type MapUpdateCallback = (data: MapGridData) => void;

let socket: Socket | null = null;
const mapUpdateListeners: MapUpdateCallback[] = [];

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
      console.log('[socket] map:update received', mapData.width, 'x', mapData.height);
      for (const cb of mapUpdateListeners) cb(mapData);
    }
  });

  socket.on('broker:event', (data: unknown) => {
    console.log('[socket] broker:event', data);
  });

  return socket;
}

export function onMapUpdate(cb: MapUpdateCallback): () => void {
  mapUpdateListeners.push(cb);
  return () => {
    const idx = mapUpdateListeners.indexOf(cb);
    if (idx >= 0) mapUpdateListeners.splice(idx, 1);
  };
}

export function requestMapGrid(): Promise<MapGridData> {
  return new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error('Socket not connected'));
      return;
    }

    const handler = (response: SocketResponse) => {
      if (response.command !== 'map:grid') return;
      socket!.off('response', handler);

      if (response.status === 'ok' && response.data) {
        resolve(response.data as MapGridData);
      } else {
        reject(new Error(response.error ?? 'map:grid failed'));
      }
    };

    socket.on('response', handler);
    socket.emit('message', { command: 'map:grid' });
  });
}
