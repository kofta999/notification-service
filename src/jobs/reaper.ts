import { db, queue } from "../app";
import { REAPING_INTERVAL_MINS } from "../config";

/** Handles notifications that died during sending and puts them back into the queue*/
async function reaper() {
  try {
    const stuckNotifications = (
      await db.notification.findMany({
        where: {
          status: "SENDING",
          updatedAt: {
            lt: new Date(Date.now() - REAPING_INTERVAL_MINS * 60 * 1000),
          },
        },
        select: { id: true },
      })
    ).map((n) => n.id);

    if (stuckNotifications.length === 0) return;

    await db.notification.updateMany({
      where: { id: { in: stuckNotifications } },
      data: { status: "QUEUED" },
    });

    await queue.enqueue(...stuckNotifications);

    console.log(
      `[Reaper] Reset ${stuckNotifications.length} stuck notifications`,
    );
  } catch (error) {
    console.error(error);
  }
}

setInterval(reaper, REAPING_INTERVAL_MINS * 60 * 1000);
console.log("[Reaper] Started");
