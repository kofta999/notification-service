import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { NotifyRequestSchema } from "./lib/schemas";
import { Queue } from "./lib/queue";
import Redis from "ioredis";
import { metrics } from "./lib/metrics";
import { register } from "prom-client";
import { env } from "./env";
import { createLogger } from "./lib/logger";
import { createPrisma } from "./lib/db";
import { Prisma } from "./generated/prisma";

const logger = createLogger("app");

const app = new Hono();
export const db = createPrisma();
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
  logger.info({ body }, "Received new notification request");

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
    logger.info(
      { notificationId: id, channel: body.channel },
      "Notification created in DB",
    );

    // Enqueue to dispatcher
    await queue.enqueue(id);
    logger.info({ notificationId: id }, "Notification enqueued for processing");

    metrics.api_jobs_enqueued_total.inc();

    return c.json({ id });
  } catch (error) {
    logger.error({ error }, "Failed to process and enqueue notification");
    metrics.api_jobs_enqueue_failed_total.inc();
    throw error;
  }
});

app.get("/status/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  logger.info({ notificationId: id }, "Fetching notification status");

  const notification = await db.notification.findFirst({
    where: { id },
    select: {
      id: true,
      updatedAt: true,
      status: true,
    },
  });

  if (!notification) {
    logger.warn({ notificationId: id }, "Notification not found");
    return c.json({ message: `Notification with id ${id} is not found` }, 404);
  }

  logger.info(
    { notificationId: id, status: notification.status },
    "Notification status found",
  );
  return c.json(notification);
});

app.get("/metrics", async (c) => {
  logger.info("Metrics endpoint accessed");
  c.header("Content-Type", register.contentType);
  const metrics = await register.metrics();
  return c.text(metrics);
});

export default app;
