import type { Socket, Server as SocketServer } from "socket.io";
import {
  createOrder,
  cancelAllOrders,
  getOrder,
  getRecentOrders,
  getCurrentOrder,
  getNextPendingOrder,
  updateOrderStatus,
  type OrderAction,
} from "../../services/bot-orders";
import type { ClientCommand, ServerResponse } from "types";

function requireAuth(socket: Socket): string {
  const id = socket.data.codingGameId as string | null;
  if (!id) throw new Error("UNAUTHORIZED: please auth:login first");
  return id;
}

export async function handleBot(
  socket: Socket,
  msg: ClientCommand,
  io?: SocketServer,
): Promise<ServerResponse> {
  switch (msg.command) {
    /**
     * Commande principale du dash : envoie le bot vers des coordonnées.
     * payload: { x: number, y: number }
     */
    case "capitain:go-to": {
      requireAuth(socket);
      const payload = msg.payload as { x?: number; y?: number };

      if (typeof payload?.x !== "number" || typeof payload?.y !== "number") {
        throw new Error("Coordonnées {x, y} requises");
      }

      const order = await createOrder("move", { coordinates: { x: payload.x, y: payload.y } });

      console.log(`[bot] Order created: ${order.id} → go-to (${payload.x},${payload.y})`);

      if (io) {
        io.emit("capitain:status", {
          orderId: order.id,
          status: "PENDING",
          target: { x: payload.x, y: payload.y },
          message: `Cap vers (${payload.x}, ${payload.y}) en attente...`,
        });
      }

      return { command: "capitain:go-to", status: "ok", data: order };
    }

    /**
     * Récupère le statut de l'ordre en cours ou d'un ordre par ID.
     * payload?: { orderId: string }
     */
    case "capitain:status": {
      const payload = msg.payload as { orderId?: string } | undefined;
      if (payload?.orderId) {
        const order = await getOrder(payload.orderId);
        if (!order) throw new Error(`Ordre ${payload.orderId} introuvable`);
        return { command: "capitain:status", status: "ok", data: order };
      }
      const current = await getCurrentOrder() ?? await getNextPendingOrder();
      return { command: "capitain:status", status: "ok", data: current };
    }

    /**
     * Liste les ordres récents.
     */
    case "capitain:orders": {
      const orders = await getRecentOrders(20);
      return { command: "capitain:orders", status: "ok", data: orders };
    }

    /**
     * Annule tous les ordres en attente/en cours.
     */
    case "capitain:cancel": {
      requireAuth(socket);
      const cancelled = await cancelAllOrders();
      console.log(`[bot] Cancelled ${cancelled} orders`);

      if (io) {
        io.emit("capitain:status", {
          status: "CANCELLED",
          message: `${cancelled} ordre(s) annulé(s)`,
        });
      }

      return { command: "capitain:cancel", status: "ok", data: { cancelled } };
    }

    /**
     * Reçoit une mise à jour de progrès de l'agent.
     * Broadcast à tous les clients via capitain:status.
     */
    case "capitain:progress": {
      const payload = msg.payload as {
        orderId: string;
        status: string;
        progress?: Record<string, unknown>;
        message?: string;
        error?: string;
      };

      if (!payload?.orderId) throw new Error("orderId requis");

      await updateOrderStatus(payload.orderId, payload.status as any, {
        progress: payload.progress as any,
        ...(payload.error && { error: payload.error }),
        ...(payload.status === "COMPLETED" && { completedAt: new Date() }),
      });

      if (io) {
        io.emit("capitain:status", payload);
      }

      return { command: "capitain:progress", status: "ok" };
    }

    default:
      throw new Error(`Unknown bot command: ${msg.command}`);
  }
}
