import type { Socket, Server as SocketServer } from "socket.io";
import { moveShip } from "../../services/game-api";
import { upsertCells, getMapGrid } from "../../services/map-store";
import type { ClientCommand, ServerResponse, Direction, Cell } from "types";

const VALID_DIRECTIONS = new Set<Direction>([
  "N", "S", "E", "W", "NE", "NW", "SE", "SW",
]);

function requireAuth(socket: Socket): string {
  const id = socket.data.codingGameId as string | null;
  if (!id) throw new Error("UNAUTHORIZED: please auth:login first");
  return id;
}

export async function handleShip(
  socket: Socket,
  msg: ClientCommand,
  io: SocketServer
): Promise<ServerResponse> {
  switch (msg.command) {
    case "ship:move": {
      const codingGameId = requireAuth(socket);
      const direction = (msg.payload as { direction: Direction })?.direction;
      if (!direction || !VALID_DIRECTIONS.has(direction)) {
        throw new Error(
          `Invalid direction "${direction}". Must be one of: ${[...VALID_DIRECTIONS].join(", ")}`
        );
      }
      const data = await moveShip(codingGameId, direction);

      // Save discovered cells + current position to DB
      const cellsToSave: Cell[] = [...(data.discoveredCells ?? [])];
      if (data.position) cellsToSave.push(data.position);
      await upsertCells(cellsToSave);

      // Broadcast updated map to all connected clients
      const mapGrid = await getMapGrid();
      io.emit("map:update", { command: "map:update", status: "ok", data: mapGrid });

      return { command: "ship:move", status: "ok", data };
    }

    default:
      throw new Error(`Unknown ship command: ${msg.command}`);
  }
}
