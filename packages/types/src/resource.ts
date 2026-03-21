export type ResourceType = "FERONIUM" | "BOISIUM" | "CHARBONIUM";

export interface Resource {
  quantity: number;
  type: ResourceType;
}
