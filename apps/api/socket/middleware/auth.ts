import type { Socket } from 'socket.io';
import { verifyAccessToken } from "../../services/auth";

export function authMiddleware(
  socket: Socket,
  next: (err?: Error) => void,
): void {
  const token = socket.handshake.auth?.token as string | undefined;

  if (!token) {
    socket.data.codingGameId = null;
    return next(); // Allow unauthenticated connections — auth:login will set the token
  }

  try {
    const payload = verifyAccessToken(token);
    socket.data.codingGameId = payload.codingGameId;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
}