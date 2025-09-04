import { db, queue } from "../app";
import { env } from "../env";
import { metrics } from "../lib/metrics";
import { createLogger } from "../lib/logger";

const logger = createLogger("reconciler");

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
              Date.now() - env.RECONCILIATION_INTERVAL_MINS * 60 * 1000,
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

    logger.info(
      { count: queuedNotifications.length },
      "Enqueued notifications",
    );
  } catch (error) {
    logger.error({ error }, "Error in reconciler job");
  }
}

setInterval(reconciler, env.RECONCILIATION_INTERVAL_MINS * 60 * 1000);
logger.info("Reconciler started");
