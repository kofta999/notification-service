import { processNotification } from "./worker";
import { db, queue } from ".";

export async function monitorQueue() {
  // If queue is empty check the db (in case of a crash)

  if (await queue.isEmpty()) {
    const queuedNotifications = await db.notification.findMany({
      where: { status: "QUEUED" },
      select: { id: true },
    });

    queuedNotifications.forEach((n) => {
      queue.enqueue(n.id);
    });
  }

  // Pop items from queue periodically
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
