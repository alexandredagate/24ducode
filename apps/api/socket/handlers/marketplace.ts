import type { Socket } from "socket.io";
import { getOffers, getOffer, createOffer, updateOffer, deleteOffer, purchaseOffer } from "../../services/game-api";
import type { ClientCommand, ServerResponse, OfferCreateRequest, Purchase } from "types";

function requireAuth(socket: Socket): string {
  const id = socket.data.codingGameId as string | null;
  if (!id) throw new Error("UNAUTHORIZED: please auth:login first");
  return id;
}

export async function handleMarketplace(
  socket: Socket,
  msg: ClientCommand
): Promise<ServerResponse> {
  switch (msg.command) {
    case "marketplace:offers": {
      const codingGameId = requireAuth(socket);
      const data = await getOffers(codingGameId);
      return { command: "marketplace:offers", status: "ok", data };
    }

    case "marketplace:offer": {
      const codingGameId = requireAuth(socket);
      const offerId = (msg.payload as { offerId: string })?.offerId;
      if (!offerId) throw new Error("offerId is required");
      const data = await getOffer(codingGameId, offerId);
      return { command: "marketplace:offer", status: "ok", data };
    }

    case "marketplace:create-offer": {
      const codingGameId = requireAuth(socket);
      const payload = msg.payload as OfferCreateRequest;
      if (!payload?.resourceType || !payload?.quantityIn || !payload?.pricePerResource) {
        throw new Error("resourceType, quantityIn and pricePerResource are required");
      }
      const data = await createOffer(codingGameId, payload);
      return { command: "marketplace:create-offer", status: "ok", data };
    }

    case "marketplace:update-offer": {
      const codingGameId = requireAuth(socket);
      const { offerId, ...body } = (msg.payload as OfferCreateRequest & { offerId: string }) ?? {};
      if (!offerId) throw new Error("offerId is required");
      const data = await updateOffer(codingGameId, offerId, body as OfferCreateRequest);
      return { command: "marketplace:update-offer", status: "ok", data };
    }

    case "marketplace:delete-offer": {
      const codingGameId = requireAuth(socket);
      const offerId = (msg.payload as { offerId: string })?.offerId;
      if (!offerId) throw new Error("offerId is required");
      await deleteOffer(codingGameId, offerId);
      return { command: "marketplace:delete-offer", status: "ok" };
    }

    case "marketplace:purchase": {
      const codingGameId = requireAuth(socket);
      const payload = msg.payload as Purchase;
      if (!payload?.offerId || !payload?.quantity) {
        throw new Error("offerId and quantity are required");
      }
      const data = await purchaseOffer(codingGameId, payload);
      return { command: "marketplace:purchase", status: "ok", data };
    }

    default:
      throw new Error(`Unknown marketplace command: ${msg.command}`);
  }
}
