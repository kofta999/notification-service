import { isMainThread, workerData } from "node:worker_threads";
import { Queue } from "../lib/queue";
import { handleNotification } from "./notification-handler";
import Redis from "ioredis";
import "./submit-metrics";
import { workerMetrics } from "./metrics";
import { env } from "../env";
import { createLogger } from "../lib/logger";
import { createPrisma } from "../lib/db";
import { RateLimiter } from "../lib/rate-limiter";
import { setTimeout } from "node:timers";

export async function workerLoop() {
  const db = createPrisma();
  const redis = new Redis(env.REDIS_URL);
  const queue = new Queue({
    queueName: "test",
    redis,
  });
  const { workerId } = workerData as { workerId: number };
  const workerLogger = createLogger(`worker-${workerId}`);
  const emailRateLimiter = new RateLimiter(redis, "rate:email", 100);
  const smsRateLimiter = new RateLimiter(redis, "rate:sms", 100);
  const pushRateLimiter = new RateLimiter(redis, "rate:push", 100);

  workerLogger.info(`Worker ${workerId} started`);

  while (true) {
    const notificationId = await queue.dequeue();
    let currentRateLimiter: RateLimiter;

    if (notificationId) {
      workerMetrics.worker_jobs_picked_up_total.inc();
      workerLogger.info({ notificationId }, "Dequeued notification");
      try {
        const maybeNotification = await db.notification.findUnique({
          where: { id: notificationId },
          select: { channel: true },
        });

        if (maybeNotification) {
          switch (maybeNotification.channel) {
            case "email": {
              currentRateLimiter = emailRateLimiter;
              break;
            }
            case "sms": {
              currentRateLimiter = smsRateLimiter;
              break;
            }
            case "push": {
              currentRateLimiter = pushRateLimiter;
              break;
            }
          }

          if (await currentRateLimiter.take()) {
            const notification = await db.notification.update({
              where: { id: notificationId, status: "QUEUED" },
              data: { status: "SENDING" },
            });

            handleNotification(notification, db, queue, workerLogger);
          } else {
            workerLogger.warn(
              { notificationId },
              `Rate limit exceeded for notification, re-queueing`,
            );
            setTimeout(
              () => queue.enqueue(notificationId),
              env.RATE_LIMIT_REQUEUE_DELAY_MS,
            );
          }
        }
      } catch (error) {
        workerLogger.error(
          { error, notificationId },
          "Error processing notification",
        );
      }
    }
  }
}

if (!isMainThread) {
  workerLoop();
}
