import amqp from "amqplib";
import type { Server as SocketServer } from "socket.io";

export async function connectBroker(io: SocketServer): Promise<void> {
  console.log("[broker] disabled — skipping connection");

  const url = "amqps://ekonsilio:410c8b64-913f-46eb-8bc0-7a197c4f506d@b-a5095b9b-3c4d-4fe7-8df1-8031e8808618.mq.eu-west-3.on.aws:5671/";

  try {
    const connection = await amqp.connect(url, { rejectUnauthorized: false });
    const channel = await connection.createChannel();

    const queue = "user.410c8b64-913f-46eb-8bc0-7a197c4f506d";
    console.log(`[broker] connected — listening on queue "${queue}"`);

    channel.consume(queue, (msg) => {
      if (!msg) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(msg.content.toString());
      } catch {
        parsed = msg.content.toString();
      }

      console.log("[broker] event received:", JSON.stringify(parsed));
      io.emit("broker:event", parsed);
      channel.ack(msg);
    });

    connection.on("error", (err) => {
      console.error("[broker] connection error:", err.message);
    });

    connection.on("close", () => {
      console.warn("[broker] connection closed — reconnecting in 5s");
      setTimeout(() => connectBroker(io), 5000);
    });
  } catch (err) {
    console.error("[broker] failed to connect:", (err as Error).message);
    console.warn("[broker] retrying in 5s...");
    setTimeout(() => connectBroker(io), 5000);
  }
}
