export interface Cell {
  id: string;
  x: number;
  y: number;
  type: "SEA" | "SAND" | "ROCKS";
  zone: number;
}
