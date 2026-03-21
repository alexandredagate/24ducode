import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { authMiddleware } from "./middleware/auth";
import { handleAuth } from "./handlers/auth";
import { handlePlayer } from "./handlers/player";
import { handleShip } from "./handlers/ship";
import type { ClientCommand, ServerResponse, CommandName } from "types";

const AUTH_COMMANDS = new Set<CommandName>(["auth:login", "auth:refresh", "auth:logout"]);
const PLAYER_COMMANDS = new Set<CommandName>(["player:details", "player:resources"]);
const SHIP_COMMANDS = new Set<CommandName>(["ship:move"]);

export function createSocketServer(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true,
    },
  });

  io.use(authMiddleware);

  io.on("connection", (socket) => {
    console.log(
      `[socket] connected  id=${socket.id}  player=${socket.data.codingGameId ?? "unauthenticated"}`
    );

    socket.onAny((event, ...args) => {
      console.log(`[socket] event="${event}"`, JSON.stringify(args));
    });

    socket.on("message", async (msg: ClientCommand) => {
      console.log(`[socket] message received:`, JSON.stringify(msg));
      let response: ServerResponse;
      try {
        const { command } = msg;
        if (!command) throw new Error("Missing 'command' field");

        if (AUTH_COMMANDS.has(command)) {
          response = await handleAuth(socket, msg);
        } else if (PLAYER_COMMANDS.has(command)) {
          response = await handlePlayer(socket, msg);
        } else if (SHIP_COMMANDS.has(command)) {
          response = await handleShip(socket, msg);
        } else {
          throw new Error(`Unknown command: ${command}`);
        }
      } catch (err) {
        response = {
          command: msg.command ?? ("unknown" as never),
          status: "error",
          error: (err as Error).message,
        };
      }

      console.log(`[socket] response:`, JSON.stringify(response));
      socket.emit("response", response);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[socket] disconnected id=${socket.id} reason=${reason}`);
    });

    socket.on("error", (err) => {
      console.error(`[socket] error id=${socket.id}`, err.message);
    });
  });

  return io;
}
