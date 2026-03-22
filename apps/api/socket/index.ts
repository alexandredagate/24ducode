import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { authMiddleware } from "./middleware/auth";
import { handleAuth } from "./handlers/auth";
import { handlePlayer } from "./handlers/player";
import { handleShip } from "./handlers/ship";
import { handleMap } from "./handlers/map";
import { handleTax } from "./handlers/tax";
import { handleStorage } from "./handlers/storage";
import { handleMarketplace } from "./handlers/marketplace";
import { handleTheft } from "./handlers/theft";
import { handleBot } from "./handlers/bot";
import type { ClientCommand, ServerResponse, CommandName } from "types";

const AUTH_COMMANDS = new Set<CommandName>(["auth:login", "auth:refresh", "auth:logout"]);
const BOT_COMMANDS = new Set<string>([
  "capitain:go-to", "capitain:status", "capitain:orders", "capitain:cancel", "capitain:progress",
  "bot:snapshot", "bot:status", "bot:history",
]);
const PLAYER_COMMANDS = new Set<CommandName>(["player:details", "player:resources"]);
const SHIP_COMMANDS = new Set<CommandName>(["ship:build", "ship:move", "ship:location", "ship:next-level", "ship:upgrade"]);
const MAP_COMMANDS = new Set<CommandName>(["map:grid", "admin:reset-discovery" as CommandName]);
const TAX_COMMANDS = new Set<CommandName>(["tax:list", "tax:pay"]);
const STORAGE_COMMANDS = new Set<CommandName>(["storage:next-level", "storage:upgrade"]);
const MARKETPLACE_COMMANDS = new Set<CommandName>(["marketplace:offers", "marketplace:offer", "marketplace:create-offer", "marketplace:update-offer", "marketplace:delete-offer", "marketplace:purchase"]);
const THEFT_COMMANDS = new Set<CommandName>(["theft:list", "theft:attack"]);

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
      const t0 = performance.now();
      let response: ServerResponse;
      try {
        const { command } = msg;
        if (!command) throw new Error("Missing 'command' field");

        if (AUTH_COMMANDS.has(command)) {
          response = await handleAuth(socket, msg);
        } else if (PLAYER_COMMANDS.has(command)) {
          response = await handlePlayer(socket, msg);
        } else if (SHIP_COMMANDS.has(command)) {
          response = await handleShip(socket, msg, io);
        } else if (MAP_COMMANDS.has(command)) {
          response = await handleMap(socket, msg, io);
        } else if (TAX_COMMANDS.has(command)) {
          response = await handleTax(socket, msg);
        } else if (STORAGE_COMMANDS.has(command)) {
          response = await handleStorage(socket, msg);
        } else if (MARKETPLACE_COMMANDS.has(command)) {
          response = await handleMarketplace(socket, msg);
        } else if (THEFT_COMMANDS.has(command)) {
          response = await handleTheft(socket, msg);
        } else if (BOT_COMMANDS.has(command)) {
          response = await handleBot(socket, msg, io);
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

      const elapsed = (performance.now() - t0).toFixed(1);
      console.log(`[perf] ${msg.command} ${response.status} ${elapsed}ms`);
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
