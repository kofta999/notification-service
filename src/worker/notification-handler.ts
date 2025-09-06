import { setTimeout as sleep } from "node:timers/promises";
import type { Notification, PrismaClient } from "../generated/prisma";
import { env } from "../env";
import { calculateBackoffDelay } from "../lib/util";
import { Queue } from "../lib/queue";
import { workerMetrics } from "./metrics";
import type { Logger } from "pino";
import { EmailProvider } from "../lib/providers/email.provider";
import { SmsProvider } from "../lib/providers/sms.provider";
import { PushNotificationProvider } from "../lib/providers/push-notification.provider";
import { SendResult } from "../lib/providers/provider.interface";

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
    let result: SendResult | undefined;

    if (notification.channel === "email") {
      const emailProvider = new EmailProvider();
      result = await emailProvider.send(notification);
    } else if (notification.channel === "sms") {
      const smsProvider = new SmsProvider();
      result = await smsProvider.send(notification);
    } else if (notification.channel === "push") {
      const pushNotificationProvider = new PushNotificationProvider();
      result = await pushNotificationProvider.send(notification);
    }

    if (result?.success) {
      await db.notification.update({
        where: { id: notification.id },
        data: { status: "SENT" },
      });

      workerMetrics.worker_jobs_sent_total.inc();

      log.info(`Notification sent successfully`);
    } else {
      log.error(
        { error: result?.error.type, retries: notification.retries },
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
    }
  } catch (error) {
    log.error({ error }, `Unexpected error`);
  } finally {
    // endTimer();
    log.debug(`Finished processing notification`);
  }
}
