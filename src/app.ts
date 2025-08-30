import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { type Prisma, PrismaClient } from "./generated/prisma";
import { NotifyRequestSchema } from "./schemas";
import { Queue } from "./queue";
import Redis from "ioredis";

const app = new Hono();
export const db = new PrismaClient();
export const queue = new Queue({
  queueName: "test",
  redis: new Redis(),
});

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.post("/notify", zValidator("json", NotifyRequestSchema), async (c) => {
  // Validate
  const body = c.req.valid("json");

  // Insert into db
  const { id } = await db.notification.create({
    data: {
      channel: body.channel,
      channelAddress: body.channelAddress,
      payload: body.payload as Prisma.JsonObject,
      recipientId: body.recipientId,
    },
    select: { id: true },
  });

  // Enqueue to dispatcher
  queue.enqueue(id);

  return c.json({ id });
});

app.get("/status/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);

  const notification = await db.notification.findFirst({
    where: { id },
    select: {
      id: true,
      updatedAt: true,
      status: true,
    },
  });

  if (!notification) {
    return c.json({ message: `Notification with id ${id} is not found` }, 404);
  }

  return c.json(notification);
});

export default app;
