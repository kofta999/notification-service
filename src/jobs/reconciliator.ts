import { db, queue } from "../app";
import { RECONCILIATION_INTERVAL_MINS } from "../config";

/** Handles notifications that are queued but not in the queue (got dequeued then crashed) */
async function reconciliator() {
  try {
    const queuedNotifications = (
      await db.notification.findMany({
        where: {
          status: "QUEUED",
        },
        select: { id: true },
      })
    ).map((n) => n.id);

    if (queuedNotifications.length === 0) return;

    queue.enqueue(...queuedNotifications);

    console.log(
      `[Reconciliator] Enqueued ${queuedNotifications.length} notifications`,
    );
  } catch (error) {
    console.error(error);
  }
}

setInterval(reconciliator, RECONCILIATION_INTERVAL_MINS * 60 * 1000);
console.log("[Reconciliator] Started");
