import type { Socket } from "socket.io";
import { getPlayerDetails, getResources } from "../../services/game-api";
import { syncDiscoveryFromPlayerDetails } from "../../services/map-store";
import type { ClientCommand, ServerResponse } from "types";

function requireAuth(socket: Socket): string {
  const id = socket.data.codingGameId as string | null;
  if (!id) throw new Error("UNAUTHORIZED: please auth:login first");
  return id;
}

export async function handlePlayer(
  socket: Socket,
  msg: ClientCommand
): Promise<ServerResponse> {
  switch (msg.command) {
    case "player:details": {
      const codingGameId = requireAuth(socket);
      const data = await getPlayerDetails(codingGameId);

      // Sync les discoveryStatus des cellules SAND en DB
      // à partir des îles KNOWN retournées par l'API game
      const knownIslands = (data.discoveredIslands ?? [])
        .filter((i: { islandState: string }) => i.islandState === "KNOWN")
        .map((i: { island: { name: string } }) => i.island.name);
      if (knownIslands.length > 0) {
        const synced = await syncDiscoveryFromPlayerDetails(knownIslands);
        if (synced > 0) {
          console.log(`[player] synced ${synced} cells → KNOWN (${knownIslands.length} islands from API)`);
        }
      }

      return { command: "player:details", status: "ok", data };
    }

    case "player:resources": {
      const codingGameId = requireAuth(socket);
      const data = await getResources(codingGameId);
      return { command: "player:resources", status: "ok", data };
    }

    default:
      throw new Error(`Unknown player command: ${msg.command}`);
  }
}
