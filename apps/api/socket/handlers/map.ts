import type { Socket } from "socket.io";
import { getMapGrid } from "../../services/map-store";
import type { ClientCommand, ServerResponse } from "types";

export async function handleMap(
  _socket: Socket,
  msg: ClientCommand
): Promise<ServerResponse> {
  switch (msg.command) {
    case "map:grid": {
      const data = await getMapGrid();
      return { command: "map:grid", status: "ok", data };
    }

    default:
      throw new Error(`Unknown map command: ${msg.command}`);
  }
}
