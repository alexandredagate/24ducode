import type { Cell } from "./cell";

export type Direction = "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW";

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
}

export interface ShipMoveResponse {
  discoveredCells: Cell[];
  position: Cell;
  energy: number;
}
