import type { Resource } from "./resource";
import type { Island, DiscoveredIsland } from "./island";

export interface PlayerDetails {
  id: string;
  signUpCode: string;
  name: string;
  quotient: number;
  money: number;
  resources: Resource[];
  home: Island;
  discoveredIslands: DiscoveredIsland[];
  marketPlaceDiscovered: boolean;
}
