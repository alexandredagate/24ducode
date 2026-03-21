import type { Socket } from "socket.io";
import { getTaxes, payTax } from "../../services/game-api";
import type { ClientCommand, ServerResponse } from "types";

function requireAuth(socket: Socket): string {
  const id = socket.data.codingGameId as string | null;
  if (!id) throw new Error("UNAUTHORIZED: please auth:login first");
  return id;
}

export async function handleTax(
  socket: Socket,
  msg: ClientCommand
): Promise<ServerResponse> {
  switch (msg.command) {
    case "tax:list": {
      const codingGameId = requireAuth(socket);
      const status = (msg.payload as { status?: string })?.status;
      const data = await getTaxes(codingGameId, status);
      return { command: "tax:list", status: "ok", data };
    }

    case "tax:pay": {
      const codingGameId = requireAuth(socket);
      const taxId = (msg.payload as { taxId: string })?.taxId;
      if (!taxId) throw new Error("taxId is required");
      await payTax(codingGameId, taxId);
      return { command: "tax:pay", status: "ok" };
    }

    default:
      throw new Error(`Unknown tax command: ${msg.command}`);
  }
}
