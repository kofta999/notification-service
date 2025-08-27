import { queue } from "./queue";
import { setTimeout as sleep } from "node:timers/promises";
import { processNotification } from "./worker";
import { db } from ".";
import { Prisma } from "./generated/prisma";

const SLEEP_DURATION_MS = 1000;

export async function monitorQueue() {
  // If queue is empty check the db (in case of a crash)

  if (queue.isEmpty()) {
    const queuedNotifications = await db.notification.findMany({
      where: { status: "QUEUED" },
    });

    queuedNotifications.forEach((n) => {
      queue.enqueue({ ...n, payload: n.payload as Prisma.JsonObject });
    });
  }

  // Pop items from queue periodically
  while (true) {
    await sleep(SLEEP_DURATION_MS);

    // console.log("CHECKING FOR NOTIFICATIONS IN QUEUE");

    const notification = queue.dequeue();

    if (notification) {
      await db.notification.update({
        where: { id: notification.id },
        data: { status: "SENDING" },
      });

      processNotification(notification);
    }
  }
}
