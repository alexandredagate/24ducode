import type { ResourceType } from "./resource";

export interface Offer {
  id: string;
  owner: { name: string };
  resourceType: ResourceType;
  quantityIn: number;
  pricePerResource: number;
}

export interface OfferCreateRequest {
  resourceType: ResourceType;
  quantityIn: number;
  pricePerResource: number;
}

export interface Purchase {
  quantity: number;
  offerId: string;
}
