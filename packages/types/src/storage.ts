import type { PriceResources } from "./resource";

export interface Storage {
  id: number;
  name: string;
  maxResources: PriceResources;
  costResources: PriceResources;
}
