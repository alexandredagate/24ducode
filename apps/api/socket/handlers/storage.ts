import type { Socket } from "socket.io";
import { getStorageNextLevel, upgradeStorage } from "../../services/game-api";
import type { ClientCommand, ServerResponse } from "types";

function requireAuth(socket: Socket): string {
  const id = socket.data.codingGameId as string | null;
  if (!id) throw new Error("UNAUTHORIZED: please auth:login first");
  return id;
}

export async function handleStorage(
  socket: Socket,
  msg: ClientCommand
): Promise<ServerResponse> {
  switch (msg.command) {
    case "storage:next-level": {
      const codingGameId = requireAuth(socket);
      const data = await getStorageNextLevel(codingGameId);
      return { command: "storage:next-level", status: "ok", data };
    }

    case "storage:upgrade": {
      const codingGameId = requireAuth(socket);
      const data = await upgradeStorage(codingGameId);
      return { command: "storage:upgrade", status: "ok", data };
    }

    default:
      throw new Error(`Unknown storage command: ${msg.command}`);
  }
}
