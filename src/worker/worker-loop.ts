import { isMainThread, workerData } from "node:worker_threads";
import { PrismaClient } from "../generated/prisma";
import { Queue } from "../lib/queue";
import { handleNotification } from "./notification-handler";
import Redis from "ioredis";
import "./submit-metrics";
import { workerMetrics } from "./metrics";
import { env } from "../env";
import { createLogger } from "../lib/logger";
import { createPrisma } from "../lib/db";

export async function workerLoop() {
  const db = createPrisma();
  const queue = new Queue({
    queueName: "test",
    redis: new Redis(env.REDIS_URL),
  });
  const { workerId } = workerData as { workerId: number };
  const workerLogger = createLogger(`worker-${workerId}`);

  workerLogger.info(`Worker ${workerId} started`);

  while (true) {
    const notificationId = await queue.dequeue();

    if (notificationId) {
      workerMetrics.worker_jobs_picked_up_total.inc();
      workerLogger.info({ notificationId }, "Dequeued notification");
      try {
        const notification = await db.notification.update({
          where: { id: notificationId, status: "QUEUED" },
          data: { status: "SENDING" },
        });

        handleNotification(notification, db, queue, workerLogger);
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
