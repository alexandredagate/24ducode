import type { Socket, Server as SocketServer } from "socket.io";
import { buildShip, moveShip, getShipNextLevel, upgradeShip } from "../../services/game-api";
import { upsertCells, getMapGrid } from "../../services/map-store";
import type { ClientCommand, ServerResponse, Direction, UpgradeShip, Cell } from "types";

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
    case "ship:build": {
      const codingGameId = requireAuth(socket);
      const data = await buildShip(codingGameId);
      return { command: "ship:build", status: "ok", data };
    }

    case "ship:move": {
      const codingGameId = requireAuth(socket);
      const direction = (msg.payload as { direction: Direction })?.direction;
      if (!direction || !VALID_DIRECTIONS.has(direction)) {
        throw new Error(
          `Invalid direction "${direction}". Must be one of: ${[...VALID_DIRECTIONS].join(", ")}`
        );
      }
      const data = await moveShip(codingGameId, direction);

      const cellsToSave: Cell[] = [...(data.discoveredCells ?? [])];
      if (data.position) cellsToSave.push(data.position);
      await upsertCells(cellsToSave);

      const mapGrid = await getMapGrid();
      io.emit("map:update", { command: "map:update", status: "ok", data: mapGrid });

      return { command: "ship:move", status: "ok", data };
    }

    case "ship:next-level": {
      const codingGameId = requireAuth(socket);
      const data = await getShipNextLevel(codingGameId);
      return { command: "ship:next-level", status: "ok", data };
    }

    case "ship:upgrade": {
      const codingGameId = requireAuth(socket);
      const payload = msg.payload as UpgradeShip;
      if (!payload?.level) throw new Error("level is required");
      await upgradeShip(codingGameId, payload);
      return { command: "ship:upgrade", status: "ok" };
    }

    default:
      throw new Error(`Unknown ship command: ${msg.command}`);
  }
}
