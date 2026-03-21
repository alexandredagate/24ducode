import type { ResourceType } from "./resource";

export interface Theft {
  id: string;
  resourceType: ResourceType;
  amountAttempted: number;
  moneySpent: number;
  createdAt: string;
  resolveAt: string;
  status: string;
  chance: "FAIBLE" | "MOYENNE" | "FORTE";
}

export interface TheftRequest {
  resourceType: ResourceType;
  moneySpent: number;
}
