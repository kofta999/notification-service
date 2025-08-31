import { db, queue } from "../app";
import { config } from "../config";
import { metrics } from "../metrics";

/** Handles notifications that are queued but not in the queue (got dequeued then crashed) */
async function reconciler() {
  metrics.reconciler_runs_total.inc();

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

    metrics.db_queued_notifications.set(queuedNotifications.length);

    if (queuedNotifications.length === 0) return;

    metrics.reconciler_jobs_detected_total.inc(queuedNotifications.length);

    await queue.enqueue(...queuedNotifications);

    metrics.reconciler_jobs_requeued_total.inc(queuedNotifications.length);

    console.log(
      `[Reconciler] Enqueued ${queuedNotifications.length} notifications`,
    );
  } catch (error) {
    console.error(error);
  }
}

setInterval(reconciler, config.RECONCILIATION_INTERVAL_MINS * 60 * 1000);
console.log("[Reconciler] Started");
