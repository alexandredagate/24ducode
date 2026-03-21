export type ResourceType = "FERONIUM" | "BOISIUM" | "CHARBONIUM";

export interface Resource {
  quantity: number;
  type: ResourceType;
}

export interface PriceResources {
  FERONIUM: number;
  BOISIUM: number;
  CHARBONIUM: number;
}
