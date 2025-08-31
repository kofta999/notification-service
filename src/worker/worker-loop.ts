import { isMainThread } from "node:worker_threads";
import { PrismaClient } from "../generated/prisma";
import { Queue } from "../queue";
import { handleNotification } from "./notification-handler";
import Redis from "ioredis";
import "./submit-metrics";
import { metrics } from "./metrics";

export async function workerLoop() {
  const db = new PrismaClient();
  const queue = new Queue({
    queueName: "test",
    redis: new Redis(),
  });

  while (true) {
    const notificationId = await queue.dequeue();

    if (notificationId) {
      metrics.worker_jobs_picked_up_total.inc();
      try {
        const notification = await db.notification.update({
          where: { id: notificationId, status: "QUEUED" },
          data: { status: "SENDING" },
        });

        handleNotification(notification, db, queue);
      } catch (error) {
        console.error(error);
      }
    }
  }
}

if (!isMainThread) {
  workerLoop();
}
