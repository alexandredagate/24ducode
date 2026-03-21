import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  PlayerDetails,
  Resource,
  ShipMoveResponse,
  ShipBuildResponse,
  Ship,
  UpgradeShip,
  Direction,
  Taxe,
  Storage,
  Offer,
  OfferCreateRequest,
  Purchase,
  Theft,
  TheftRequest
} from "types";

const baseURL = 'http://ec2-15-237-116-133.eu-west-3.compute.amazonaws.com:8443';

function createClient(codingGameId: string): AxiosInstance {
  return axios.create({
    baseURL,
    headers: {
      "codinggame-id": codingGameId,
      "Content-Type": "application/json",
    },
    timeout: 10_000,
  });
}

function handleError(err: unknown): never {
  if (err instanceof AxiosError) {
    const data = err.response?.data;
    const msg = data?.message || data?.codeError || err.message;
    const detail = typeof data === "object" && data ? JSON.stringify(data) : "";
    throw new Error(detail && detail !== `"${msg}"` ? `${msg} — ${detail}` : msg);
  }
  throw err;
}

export async function getPlayerDetails(
  codingGameId: string
): Promise<PlayerDetails> {
  try {
    const { data } = await createClient(codingGameId).get("/players/details");
    return data as PlayerDetails;
  } catch (err) {
    handleError(err);
  }
}

export async function getResources(codingGameId: string): Promise<Resource[]> {
  try {
    console.log("getResources");
    const { data } = await createClient(codingGameId).get("/resources");
    console.log(data);
    return data as Resource[];
  } catch (err) {
    handleError(err);
  }
}

export async function buildShip(codingGameId: string): Promise<ShipBuildResponse> {
  try {
    const { data } = await createClient(codingGameId).post("/ship/build");
    return data as ShipBuildResponse;
  } catch (err) {
    handleError(err);
  }
}

export async function moveShip(
  codingGameId: string,
  direction: Direction
): Promise<ShipMoveResponse> {
  try {
    const { data } = await createClient(codingGameId).post("/ship/move", {
      direction,
    });
    return data as ShipMoveResponse;
  } catch (err) {
    handleError(err);
  }
}

export async function getShipNextLevel(codingGameId: string): Promise<Ship> {
  try {
    const { data } = await createClient(codingGameId).get("/ship/next-level");
    return data as Ship;
  } catch (err) {
    handleError(err);
  }
}

export async function upgradeShip(codingGameId: string, body: UpgradeShip): Promise<void> {
  try {
    await createClient(codingGameId).put("/ship/upgrade", body);
  } catch (err) {
    handleError(err);
  }
}

export async function getTaxes(codingGameId: string, status?: string): Promise<Taxe[]> {
  try {
    const params = status ? { status } : {};
    const { data } = await createClient(codingGameId).get("/taxes", { params });
    return data as Taxe[];
  } catch (err) {
    handleError(err);
  }
}

export async function payTax(codingGameId: string, taxId: string): Promise<void> {
  try {
    await createClient(codingGameId).put(`/taxes/${taxId}`);
  } catch (err) {
    handleError(err);
  }
}

export async function getStorageNextLevel(codingGameId: string): Promise<Storage> {
  try {
    const { data } = await createClient(codingGameId).get("/storage/next-level");
    return data as Storage;
  } catch (err) {
    handleError(err);
  }
}

export async function upgradeStorage(codingGameId: string): Promise<Storage> {
  try {
    const { data } = await createClient(codingGameId).put("/storage/upgrade");
    return data as Storage;
  } catch (err) {
    handleError(err);
  }
}

export async function getOffers(codingGameId: string): Promise<Offer[]> {
  try {
    const { data } = await createClient(codingGameId).get("/marketplace/offers");
    return data as Offer[];
  } catch (err) {
    handleError(err);
  }
}

export async function getOffer(codingGameId: string, offerId: string): Promise<Offer> {
  try {
    const { data } = await createClient(codingGameId).get(`/marketplace/offers/${offerId}`);
    return data as Offer;
  } catch (err) {
    handleError(err);
  }
}

export async function createOffer(codingGameId: string, body: OfferCreateRequest): Promise<Offer> {
  try {
    const { data } = await createClient(codingGameId).post("/marketplace/offers", body);
    return data as Offer;
  } catch (err) {
    handleError(err);
  }
}

export async function updateOffer(codingGameId: string, offerId: string, body: OfferCreateRequest): Promise<Offer> {
  try {
    const { data } = await createClient(codingGameId).patch(`/marketplace/offers/${offerId}`, body);
    return data as Offer;
  } catch (err) {
    handleError(err);
  }
}

export async function deleteOffer(codingGameId: string, offerId: string): Promise<void> {
  try {
    await createClient(codingGameId).delete(`/marketplace/offers/${offerId}`);
  } catch (err) {
    handleError(err);
  }
}

export async function purchaseOffer(codingGameId: string, body: Purchase): Promise<Purchase> {
  try {
    const { data } = await createClient(codingGameId).post("/marketplace/purchases", body);
    return data as Purchase;
  } catch (err) {
    handleError(err);
  }
}

export async function getThefts(codingGameId: string): Promise<Theft[]> {
  try {
    const { data } = await createClient(codingGameId).get("/thefts");
    return data as Theft[];
  } catch (err) {
    handleError(err);
  }
}

export async function attackPlayer(codingGameId: string, body: TheftRequest): Promise<Theft> {
  try {
    const { data } = await createClient(codingGameId).post("/thefts/player", body);
    return data as Theft;
  } catch (err) {
    handleError(err);
  }
}
