export type CellNote = "HOME" | "TRAD";
export type DiscoveryStatus = "DISCOVERED" | "KNOWN";

export interface Cell {
  id: string;
  x: number;
  y: number;
  type: "SEA" | "SAND";
  zone: number;
  note?: CellNote;
  discoveryStatus?: DiscoveryStatus;
}
