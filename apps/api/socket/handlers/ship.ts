import type { Socket, Server as SocketServer } from "socket.io";
import { buildShip, moveShip, getShipNextLevel, upgradeShip } from "../../services/game-api";
import { upsertCells, getMapGrid, saveShipPosition, getShipPosition, getCellAt, validateDiscoveries, markConfirmedRefuel } from "../../services/map-store";
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
      // Énergie avant le move (pour détecter un refill)
      const prevState = await getShipPosition(codingGameId);
      const energyBefore = prevState?.energy ?? 0;

      const data = await moveShip(codingGameId, direction);

      // Si le bateau arrive sur SAND et que l'énergie a AUGMENTÉ → refuel confirmé
      if (data.position?.type === "SAND" && data.energy > energyBefore) {
        await markConfirmedRefuel(data.position.x, data.position.y);
        console.log(`[ship] REFUEL CONFIRMÉ à (${data.position.x},${data.position.y}) energy ${energyBefore}→${data.energy}`);
      }

      // Vérifier si la position AVANT upsert est déjà KNOWN
      // (évite que ALWAYS_KNOWN force KNOWN + valide dans la même requête)
      let wasKnownBeforeUpsert = false;
      if (data.position?.type === "SAND") {
        const cellBefore = await getCellAt(data.position.x, data.position.y);
        wasKnownBeforeUpsert = cellBefore?.discoveryStatus === "KNOWN";
      }

      const cellsToSave: Cell[] = [...(data.discoveredCells ?? [])];
      if (data.position) cellsToSave.push(data.position);
      await upsertCells(cellsToSave);

      // Valider les découvertes seulement si on arrive sur une île qui
      // était DÉJÀ KNOWN avant ce move (pas juste rendue KNOWN par ALWAYS_KNOWN)
      let validated = 0;
      if (wasKnownBeforeUpsert) {
        validated = await validateDiscoveries();
        if (validated > 0) {
          console.log(`[ship] validated ${validated} discovered cells → KNOWN`);
        }
      }

      const mapGrid = await getMapGrid();
      io.emit("map:update", { command: "map:update", status: "ok", data: mapGrid });

      // Enrich position with note + discoveryStatus
      let enrichedPosition = data.position;
      if (data.position) {
        const cellData = await getCellAt(data.position.x, data.position.y);
        if (cellData) {
          enrichedPosition = {
            ...data.position,
            ...(cellData.note && { note: cellData.note }),
            ...(cellData.discoveryStatus && { discoveryStatus: cellData.discoveryStatus }),
          };
        }
      }

      await saveShipPosition(codingGameId, enrichedPosition, data.energy);
      io.emit("ship:position", {
        position: enrichedPosition,
        energy: data.energy,
        ...(validated > 0 && { validated }),
      });

      return { command: "ship:move", status: "ok", data };
    }

    case "ship:location": {
      const codingGameId = requireAuth(socket);
      const data = await getShipPosition(codingGameId);
      if (!data) throw new Error("No position known yet — move the ship first");
      const cellInfo = await getCellAt(data.position.x, data.position.y);
      if (cellInfo) {
        data.position = {
          ...data.position,
          ...(cellInfo.note && { note: cellInfo.note }),
          ...(cellInfo.discoveryStatus && { discoveryStatus: cellInfo.discoveryStatus }),
        };
      }
      return { command: "ship:location", status: "ok", data };
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