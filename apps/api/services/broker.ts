import amqp from "amqplib";
import type { Server as SocketServer } from "socket.io";

export async function connectBroker(io: SocketServer): Promise<void> {
  const host = process.env.BROKER_HOST || "b-a5095b9b-3c4d-4fe7-8df1-8031e8808618.mq.eu-west-3.on.aws";
  const port = process.env.BROKER_PORT || "5671";
  const user = process.env.BROKER_USER || "";
  const pass = process.env.BROKER_PASS || "";
  const queue = process.env.BROKER_QUEUE || "";

  if (!user || !pass || !queue) {
    console.warn("[broker] missing BROKER_USER, BROKER_PASS or BROKER_QUEUE — skipping");
    return;
  }

  const url = `amqps://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;

  try {
    const connection = await amqp.connect(url);
    const channel = await connection.createChannel();

    await channel.assertQueue(queue, { durable: true });
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
