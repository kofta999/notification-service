import { setTimeout as sleep } from "node:timers/promises";
import type { Notification, PrismaClient } from "../generated/prisma";
import { env } from "../env";
import { calculateBackoffDelay } from "../lib/util";
import { Queue } from "../lib/queue";
import { workerMetrics } from "./metrics";
import type { Logger } from "pino";

export async function handleNotification(
  notification: Notification,
  db: PrismaClient,
  queue: Queue,
  parentLogger: Logger,
) {
  const log = parentLogger.child({ notificationId: notification.id });
  // Send notification
  log.info({ channel: notification.channel }, `Sending notification`);
  // const endTimer = metrics.worker_processing_duration_seconds.startTimer();

  try {
    if (notification.channel === "email") {
      await sendEmail(notification);
    }

    await db.notification.update({
      where: { id: notification.id },
      data: { status: "SENT" },
    });

    workerMetrics.worker_jobs_sent_total.inc();

    log.info(`Notification sent successfully`);
  } catch (error) {
    log.error(
      { error, retries: notification.retries },
      `Error sending notification`,
    );

    if (notification.retries < env.MAX_RETRIES) {
      const delay = calculateBackoffDelay(
        notification.retries,
        env.BACKOFF_EXPONENTIAL_FACTOR,
        env.BACKOFF_BASE_DELAY_MS,
      );

      log.warn(
        { delay, retries: notification.retries + 1 },
        `Requeueing notification`,
      );
      await sleep(delay);

      await db.notification.update({
        where: { id: notification.id },
        data: { retries: { increment: 1 }, status: "QUEUED" },
      });

      await queue.enqueue(notification.id);

      workerMetrics.worker_jobs_retried_total.inc();

      log.info(`Notification requeued successfully`);
    } else {
      log.error(`Notification failed after max retries`);
      await db.notification.update({
        where: { id: notification.id },
        data: { status: "FAILED" },
      });

      workerMetrics.worker_jobs_failed_total.inc();
    }
  } finally {
    // endTimer();
    log.debug(`Finished processing notification`);
  }
}

async function sendEmail(notification: Notification) {
  const sleepDuration = Math.random() * 10000;
  await sleep(sleepDuration);

  if (sleepDuration >= 5000) {
    throw new Error("Failed to send email");
  }
}
