import { setTimeout as sleep } from "node:timers/promises";
import type { Notification, PrismaClient } from "../generated/prisma";
import { env } from "../config";
import { calculateBackoffDelay } from "../util";
import { Queue } from "../queue";
import { workerMetrics } from "./metrics";

export async function handleNotification(
  notification: Notification,
  db: PrismaClient,
  queue: Queue,
) {
  // Send notification
  console.log(`Sending notification with ID: ${notification.id}`);
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

    console.log(`Notification with ID: ${notification.id} is sent`);
  } catch (error) {
    if (notification.retries < env.MAX_RETRIES) {
      const delay = calculateBackoffDelay(
        notification.retries,
        env.BACKOFF_EXPONENTIAL_FACTOR,
        env.BACKOFF_BASE_DELAY_MS,
      );

      console.log(
        `Notification with ID: ${notification.id} requeued in ${delay}ms. Retry count: ${notification.retries}`,
      );
      await sleep(delay);

      await db.notification.update({
        where: { id: notification.id },
        data: { retries: { increment: 1 }, status: "QUEUED" },
      });

      await queue.enqueue(notification.id);

      workerMetrics.worker_jobs_retried_total.inc();

      console.log(`Notification with ID: ${notification.id} requeued`);
    } else {
      console.log(`Failed to send notification with ID: ${notification.id}`);
      await db.notification.update({
        where: { id: notification.id },
        data: { status: "FAILED" },
      });

      workerMetrics.worker_jobs_failed_total.inc();
    }
  } finally {
    // endTimer();
  }
}

async function sendEmail(notification: Notification) {
  const sleepDuration = Math.random() * 10000;
  await sleep(sleepDuration);

  if (sleepDuration >= 5000) {
    throw new Error("Failed to send email");
  }
}
