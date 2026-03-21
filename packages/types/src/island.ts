export interface Island {
  name: string;
  bonusQuotient: number;
}

export interface DiscoveredIsland {
  island: Island;
  islandState: "KNOWN" | "DISCOVERED";
}
