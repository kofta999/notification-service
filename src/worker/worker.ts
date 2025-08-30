import { setTimeout as sleep } from "node:timers/promises";
import type { Notification, PrismaClient } from "../generated/prisma";
import { config } from "../config";
import { calculateBackoffDelay } from "../util";
import { Queue } from "../queue";

export async function processNotification(
  notification: Notification,
  db: PrismaClient,
  queue: Queue,
) {
  // Send notification
  console.log(`Sending notification with ID: ${notification.id}`);
  try {
    if (notification.channel === "email") {
      await sendEmail(notification);
    }

    await db.notification.update({
      where: { id: notification.id },
      data: { status: "SENT" },
    });

    console.log(`Notification with ID: ${notification.id} is sent`);
  } catch (error) {
    if (notification.retries < config.MAX_RETRIES) {
      notification.retries += 1;

      const delay = calculateBackoffDelay(
        notification.retries,
        config.BACKOFF_EXPONENTIAL_FACTOR,
        config.BACKOFF_BASE_DELAY_MS,
      );

      console.log(
        `Notification with ID: ${notification.id} requeued in ${delay}ms. Retry count: ${notification.retries}`,
      );
      await sleep(delay);

      await db.notification.update({
        where: { id: notification.id },
        data: { retries: notification.retries, status: "QUEUED" },
      });

      queue.enqueue(notification.id);

      console.log(`Notification with ID: ${notification.id} requeued`);
    } else {
      console.log(`Failed to send notification with ID: ${notification.id}`);
      await db.notification.update({
        where: { id: notification.id },
        data: { status: "FAILED" },
      });
    }
  }
}

async function sendEmail(notification: Notification) {
  const sleepDuration = Math.random() * 10000;
  await sleep(sleepDuration);

  if (sleepDuration >= 5000) {
    throw new Error("Failed to send email");
  }
}
