import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { register } from "prom-client";
import { SQSClient } from "@aws-sdk/client-sqs";

import { NotifyRequestSchema } from "./lib/schemas";
import { apiKeyAuth } from "./middleware/auth";
import { apiRateLimit } from "./middleware/rate-limit";
import { errorHandler } from "./middleware/error-handler";

import { env } from "shared/env";
import { createLogger } from "shared/logger";
import { metrics } from "shared/metrics";
import { SqsQueue } from "shared/queue";
import { InvalidPayloadError } from "shared/errors";
import { notificationTable } from "shared/db";

const logger = createLogger("app");
const app = new Hono();

app.use(errorHandler);

export const queue = new SqsQueue(
  env.NOTIFICATION_QUEUE_URL,
  new SQSClient({ region: env.AWS_REGION }),
);

app.get("/", (c) => c.text("Hello Hono!"));

app.post(
  "/notify",
  apiKeyAuth,
  apiRateLimit,
  zValidator("json", NotifyRequestSchema),
  async (c) => {
    const body = c.req.valid("json");
    logger.info({ body }, "Received new notification request");

    try {
      const notification = await notificationTable.create({
        recipientId: body.recipientId,
        channel: body.channel,
        channelAddress: body.channelAddress,
        payload: body.payload,
      });

      await queue.enqueue(notification.id);

      logger.info(
        { notificationId: notification.id, channel: notification.channel },
        "Notification created and enqueued",
      );

      metrics.api_jobs_enqueued_total.inc();

      return c.json({ id: notification.id }, 200);
    } catch (error) {
      logger.error({ error }, "Failed to process and enqueue notification");
      metrics.api_jobs_enqueue_failed_total.inc();
      throw new InvalidPayloadError("Failed to process and enqueue notification", {
        cause: error as Error,
      });
    }
  },
);

app.get("/status/:id", apiKeyAuth, async (c) => {
  const id = c.req.param("id");
  logger.info({ notificationId: id }, "Fetching notification status");

  const notification = await notificationTable.findById(id);

  if (!notification) {
    logger.warn({ notificationId: id }, "Notification not found");
    return c.json({ message: `Notification with id ${id} is not found` }, 404);
  }

  return c.json(
    {
      id: notification.id,
      status: notification.status,
      updatedAt: notification.updatedAt,
    },
    200,
  );
});

app.get("/metrics", async (c) => {
  c.header("Content-Type", register.contentType);
  return c.text(await register.metrics());
});

app.get("/health", async (c) => {
  try {
    await dbHealthcheck();
    return c.json({ status: "healthy" }, 200);
  } catch (error) {
    logger.error({ error }, "Healthcheck failed");
    return c.json({ status: "unhealthy" }, 503);
  }
});

async function dbHealthcheck() {
  if (typeof (notificationTable as any).healthcheck === "function") {
    await (notificationTable as any).healthcheck();
    return;
  }

  // Fallback lightweight operation if dedicated health method isn't exposed.
  await notificationTable.find({ limit: 1 });
}

export default app;
