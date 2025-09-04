import { db, queue } from "../app";
import { env } from "../config";
import { metrics } from "../metrics";

/** Handles notifications that died during sending and puts them back into the queue*/
async function reaper() {
  metrics.reaper_runs_total.inc();

  try {
    const stuckNotifications = (
      await db.notification.findMany({
        where: {
          status: "SENDING",
          updatedAt: {
            lt: new Date(Date.now() - env.REAPING_INTERVAL_MINS * 60 * 1000),
          },
        },
        select: { id: true },
      })
    ).map((n) => n.id);

    metrics.db_sending_notifications.set(stuckNotifications.length);

    if (stuckNotifications.length === 0) return;

    metrics.reaper_stuck_jobs_detected_total.inc(stuckNotifications.length);

    await db.notification.updateMany({
      where: { id: { in: stuckNotifications } },
      data: { status: "QUEUED" },
    });

    await queue.enqueue(...stuckNotifications);

    metrics.reaper_stuck_jobs_requeued_total.inc(stuckNotifications.length);

    console.log(
      `[Reaper] Reset ${stuckNotifications.length} stuck notifications`,
    );
  } catch (error) {
    console.error(error);
  }
}

setInterval(reaper, env.REAPING_INTERVAL_MINS * 60 * 1000);
console.log("[Reaper] Started");
