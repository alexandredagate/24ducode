export type CellNote = "HOME" | "TRAD";

export interface Cell {
  id: string;
  x: number;
  y: number;
  type: "SEA" | "SAND";
  zone: number;
  note?: CellNote;
}
