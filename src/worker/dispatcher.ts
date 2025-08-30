import { isMainThread } from "node:worker_threads";
import { PrismaClient } from "../generated/prisma";
import { Queue } from "../queue";
import { processNotification } from "./worker";
import Redis from "ioredis";

export const db = new PrismaClient();
export const queue = new Queue({
  queueName: "test",
  redis: new Redis(),
});

export async function monitorQueue(db: PrismaClient, queue: Queue) {
  // If queue is empty check the db (in case of a crash)

  // if (await queue.isEmpty()) {
  //   const queuedNotifications = await db.notification.findMany({
  //     where: { status: "QUEUED" },
  //     select: { id: true },
  //   });

  //   queuedNotifications.forEach((n) => {
  //     queue.enqueue(n.id);
  //   });
  // }

  // Pop items from queue
  while (true) {
    const notificationId = await queue.dequeue();

    if (notificationId) {
      const notification = await db.notification.update({
        where: { id: notificationId },
        data: { status: "SENDING" },
      });

      processNotification(notification);
    }
  }
}

if (!isMainThread) {
  monitorQueue(db, queue);
}
