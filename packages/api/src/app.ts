import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { NotifyRequestSchema } from "./lib/schemas";
import { Queue } from "shared/queue";
import Redis from "ioredis";
import { metrics } from "shared/metrics";
import { register } from "prom-client";
import { env } from "shared/env";
import { createLogger } from "shared/logger";
import { createPrisma } from "shared/db";
import type { Prisma } from "shared/prisma/client";
import { apiKeyAuth } from "./middleware/auth";
import { apiRateLimit } from "./middleware/rate-limit";
import { errorHandler } from "./middleware/error-handler";
import { InvalidPayloadError } from "shared/errors";
import { httpInstrumentationMiddleware } from "@hono/otel";
import "shared/otel";

const logger = createLogger("app");

const app = new Hono();
app.use(httpInstrumentationMiddleware())
app.use(errorHandler);

export const db = createPrisma();
export const redis = new Redis(env.REDIS_URL);
export const queue = new Queue({
  queueName: "test",
  redis,
  timeoutSecs: 5
});

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.post("/notify", apiKeyAuth, apiRateLimit, zValidator("json", NotifyRequestSchema), async (c) => {
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
    throw new InvalidPayloadError("Failed to process and enqueue notification", { cause: error as Error });
  }
});

app.get("/status/:id", apiKeyAuth, async (c) => {
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

app.get("/health", async (c) => {
  try {
    await Promise.all([db.$queryRaw`SELECT 1`, redis.ping()]);

    return c.json({ status: "healthy" }, 200);
  } catch (error) {
    return c.json({ status: "unhealthy", error }, 503);
  }
});

export default app;
