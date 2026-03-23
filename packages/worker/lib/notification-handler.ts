import type { Logger } from "pino";
import type { Notification, NotificationTable } from "shared/db";
import { workerMetrics } from "./metrics";
import { EmailProvider } from "./providers/email.provider";
import { PushNotificationProvider } from "./providers/push-notification.provider";
import { SmsProvider } from "./providers/sms.provider";
import type { IProvider } from "./providers/provider.interface";
import { NotificationError } from "shared/errors";

export class NotificationHandler {
  private providerMap: Record<Notification["channel"], () => IProvider> = {
    email: () => new EmailProvider(),
    sms: () => new SmsProvider(),
    push: () => new PushNotificationProvider(),
  };

  constructor(
    private notification: Notification,
    private notificationTable: NotificationTable,
    private parentLogger: Logger,
  ) {}

  async handle() {
    const logger = this.parentLogger.child({
      notificationId: this.notification.id,
    });

    logger.info({ channel: this.notification.channel }, "Sending notification");

    try {
      const provider = this.getProvider(this.notification.channel);
      await provider.send(this.notification);
      await this.handleSuccess(logger);
    } catch (error) {
      if (error instanceof NotificationError && !error.retryable) {
        await this.markAsFailed(logger);
        return;
      }

      logger.error(
        { error },
        "Unexpected error while processing notification",
      );
      throw error;
    } finally {
      logger.debug("Finished processing notification");
    }
  }

  private async handleSuccess(log: Logger) {
    await this.notificationTable.markSent(this.notification.id);
    workerMetrics.worker_jobs_sent_total.inc();
    log.info("Notification sent successfully");
  }

  private async markAsFailed(log: Logger) {
    await this.notificationTable.markFailed(this.notification.id);
    workerMetrics.worker_jobs_failed_total.inc();
    log.error("Notification failed after max retries");
  }

  private getProvider(channel: Notification["channel"]): IProvider {
    const providerFactory = this.providerMap[channel];
    if (!providerFactory) {
      throw new Error(`Unsupported channel: ${channel}`);
    }
    return providerFactory();
  }
}
