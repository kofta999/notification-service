import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { type Prisma, PrismaClient } from "./generated/prisma";
import { NotifyRequestSchema } from "./lib/schemas";
import { Queue } from "./lib/queue";
import Redis from "ioredis";
import { metrics } from "./lib/metrics";
import { register } from "prom-client";
import { env } from "./env";

const app = new Hono();
export const db = new PrismaClient();
export const queue = new Queue({
  queueName: "test",
  redis: new Redis(env.REDIS_URL),
});

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.post("/notify", zValidator("json", NotifyRequestSchema), async (c) => {
  // Validate
  const body = c.req.valid("json");

  try {
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
    await queue.enqueue(id);

    metrics.api_jobs_enqueued_total.inc();

    return c.json({ id });
  } catch (error) {
    console.error(error);
    metrics.api_jobs_enqueue_failed_total.inc();
    throw error;
  }
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

app.get("/metrics", async (c) => {
  c.header("Content-Type", register.contentType);
  const metrics = await register.metrics();
  return c.text(metrics);
});

export default app;
