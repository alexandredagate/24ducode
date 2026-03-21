import type { Socket } from "socket.io";
import { getThefts, attackPlayer } from "../../services/game-api";
import type { ClientCommand, ServerResponse, TheftRequest } from "types";

function requireAuth(socket: Socket): string {
  const id = socket.data.codingGameId as string | null;
  if (!id) throw new Error("UNAUTHORIZED: please auth:login first");
  return id;
}

export async function handleTheft(
  socket: Socket,
  msg: ClientCommand
): Promise<ServerResponse> {
  switch (msg.command) {
    case "theft:list": {
      const codingGameId = requireAuth(socket);
      const data = await getThefts(codingGameId);
      return { command: "theft:list", status: "ok", data };
    }

    case "theft:attack": {
      const codingGameId = requireAuth(socket);
      const payload = msg.payload as TheftRequest;
      if (!payload?.resourceType || !payload?.moneySpent) {
        throw new Error("resourceType and moneySpent are required");
      }
      const data = await attackPlayer(codingGameId, payload);
      return { command: "theft:attack", status: "ok", data };
    }

    default:
      throw new Error(`Unknown theft command: ${msg.command}`);
  }
}
