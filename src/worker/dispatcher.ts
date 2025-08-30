import { isMainThread } from "node:worker_threads";
import { PrismaClient } from "../generated/prisma";
import { Queue } from "../queue";
import { processNotification } from "./worker";
import Redis from "ioredis";

export async function monitorQueue() {
  const db = new PrismaClient();
  const queue = new Queue({
    queueName: "test",
    redis: new Redis(),
  });

  while (true) {
    const notificationId = await queue.dequeue();

    if (notificationId) {
      try {
        const notification = await db.notification.update({
          where: { id: notificationId, status: "QUEUED" },
          data: { status: "SENDING" },
        });

        processNotification(notification, db, queue);
      } catch (error) {
        console.error(error);
      }
    }
  }
}

if (!isMainThread) {
  monitorQueue();
}
