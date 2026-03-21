import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  PlayerDetails,
  Resource,
  ShipMoveResponse,
  Direction
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
    const msg =
      err.response?.data?.message ||
      err.response?.data?.codeError ||
      err.message;
    throw new Error(msg);
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
