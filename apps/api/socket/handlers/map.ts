import type { Socket, Server as SocketServer } from "socket.io";
import { getMapGrid, resetDiscoveryStatus } from "../../services/map-store";
import type { ClientCommand, ServerResponse } from "types";

export async function handleMap(
  _socket: Socket,
  msg: ClientCommand,
  io?: SocketServer
): Promise<ServerResponse> {
  switch (msg.command) {
    case "map:grid": {
      const data = await getMapGrid();
      return { command: "map:grid", status: "ok", data };
    }

    case "admin:reset-discovery": {
      const result = await resetDiscoveryStatus();
      console.log(`[admin] reset discovery: ${result.reset} cells → DISCOVERED, ${result.home} → KNOWN (HOME)`);

      // Broadcast la nouvelle map à tous les clients
      if (io) {
        const mapGrid = await getMapGrid();
        io.emit("map:update", { command: "map:update", status: "ok", data: mapGrid });
      }

      return { command: "admin:reset-discovery", status: "ok", data: result };
    }

    default:
      throw new Error(`Unknown map command: ${msg.command}`);
  }
}
