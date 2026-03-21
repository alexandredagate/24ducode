import type { Socket } from "socket.io";
import {
  issueTokens,
  refreshAccessToken,
  verifyRefreshToken,
} from "../../services/auth";
import {getPlayerDetails, getResources} from "../../services/game-api";
import type {
  AuthLoginPayload,
  AuthRefreshPayload,
  ClientCommand,
  ServerResponse,
} from "types";

export async function handleAuth(
  socket: Socket,
  msg: ClientCommand
): Promise<ServerResponse> {
  switch (msg.command) {
    case "auth:login": {
      const { codingGameId } = (msg.payload ?? {}) as AuthLoginPayload;
      if (!codingGameId) throw new Error("codingGameId is required");

      // Validate codingGameId against the game API
      const player = await getResources(codingGameId);
      socket.data.codingGameId = codingGameId;

      const tokens = issueTokens(codingGameId);

      return { command: "auth:login", status: "ok", data: tokens };
    }

    case "auth:refresh": {
      const { refreshToken } = (msg.payload ?? {}) as AuthRefreshPayload;
      if (!refreshToken) throw new Error("refreshToken is required");

      const payload = verifyRefreshToken(refreshToken);
      socket.data.codingGameId = payload.codingGameId;

      const tokens = refreshAccessToken(refreshToken);
      return { command: "auth:refresh", status: "ok", data: tokens };
    }

    case "auth:logout": {
      socket.data.codingGameId = null;
      socket.data.playerName = null;
      return { command: "auth:logout", status: "ok" };
    }

    default:
      throw new Error(`Unknown auth command: ${msg.command}`);
  }
}
