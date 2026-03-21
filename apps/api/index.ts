import "dotenv/config";
import { createServer } from "http";
import express from "express";
import { createSocketServer } from "./socket";

const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

const httpServer = createServer(app);
createSocketServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
  console.log(`[api] socket.io ready`);
});