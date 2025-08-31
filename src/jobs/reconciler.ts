import { db, queue } from "../app";
import { config } from "../config";

/** Handles notifications that are queued but not in the queue (got dequeued then crashed) */
async function reconciler() {
  try {
    const queuedNotifications = (
      await db.notification.findMany({
        where: {
          status: "QUEUED",
          updatedAt: {
            lt: new Date(
              Date.now() - config.RECONCILIATION_INTERVAL_MINS * 60 * 1000,
            ),
          },
        },
        select: { id: true },
      })
    ).map((n) => n.id);

    if (queuedNotifications.length === 0) return;

    queue.enqueue(...queuedNotifications);

    console.log(
      `[Reconciler] Enqueued ${queuedNotifications.length} notifications`,
    );
  } catch (error) {
    console.error(error);
  }
}

setInterval(reconciler, config.RECONCILIATION_INTERVAL_MINS * 60 * 1000);
console.log("[Reconciler] Started");
