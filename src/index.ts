import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { type Prisma, PrismaClient } from "./generated/prisma";
import { NotifyRequestSchema } from "./schemas";
import { queue } from "./queue";
import { monitorQueue } from "./dispatcher";

const app = new Hono();
export const db = new PrismaClient();

monitorQueue();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.post("/notify", zValidator("json", NotifyRequestSchema), async (c) => {
  // Validate
  const body = c.req.valid("json");

  // Insert into db
  const notification = await db.notification.create({
    data: {
      channel: body.channel,
      channelAddress: body.channelAddress,
      payload: body.payload as Prisma.JsonObject,
      recipientId: body.recipientId,
    },
  });

  // Enqueue to dispatcher
  queue.enqueue(notification);

  return c.json({ id: notification.id });
});

export default app;
