export interface Taxe {
  id: string;
  type: "RESCUE" | "CHEAT";
  state: "DUE" | "PAID";
  amount: number;
  remainingTime: number;
  player: {
    id: string;
    name: string;
  };
}
