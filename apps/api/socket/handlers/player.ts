import type { Socket } from "socket.io";
import { getPlayerDetails, getResources } from "../../services/game-api";
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
