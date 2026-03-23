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

  private readonly maxRetries = Number.parseInt(
    process.env.MAX_RETRIES ?? "5",
    10,
  );

  constructor(
    private notification: Notification,
    private notificationTable: NotificationTable,
    private parentLogger: Logger,
  ) {}

  async handle() {
    const logger = this.parentLogger.child({
      notificationId: this.notification.id,
      channel: this.notification.channel,
      currentRetries: this.notification.retries ?? 0,
      maxRetries: this.maxRetries,
    });

    logger.info("Sending notification");

    try {
      const provider = this.getProvider(this.notification.channel);
      await provider.send(this.notification);
      await this.handleSuccess(logger);
      return;
    } catch (error) {
      if (error instanceof NotificationError && !error.retryable) {
        await this.markAsFailed(logger, "Non-retryable error from provider");
        return;
      }

      await this.handleRetryableFailure(error, logger);
      return;
    } finally {
      logger.debug("Finished processing notification");
    }
  }

  private async handleSuccess(log: Logger) {
    await this.notificationTable.markSent(this.notification.id);
    workerMetrics.worker_jobs_sent_total.inc();
    log.info("Notification sent successfully");
  }

  private async handleRetryableFailure(error: unknown, log: Logger) {
    const retries = await this.notificationTable.incrementRetries(this.notification.id);

    if (retries > this.maxRetries) {
      await this.markAsFailed(
        log,
        `Exceeded max retries (${retries}/${this.maxRetries}), marking as FAILED`,
      );
      return;
    }

    workerMetrics.worker_jobs_retried_total.inc();

    log.warn(
      {
        error,
        retries,
        remainingRetries: Math.max(this.maxRetries - retries, 0),
      },
      "Retryable failure, allowing SQS retry (message will be retried and can eventually go to DLQ)",
    );

    // Throw so Lambda reports this record as failed.
    // SQS retry policy handles retries and DLQ routing.
    throw error instanceof Error ? error : new Error(String(error));
  }

  private async markAsFailed(log: Logger, reason: string) {
    await this.notificationTable.markFailed(this.notification.id);
    workerMetrics.worker_jobs_failed_total.inc();
    log.error({ reason }, "Notification marked as FAILED");
  }

  private getProvider(channel: Notification["channel"]): IProvider {
    const providerFactory = this.providerMap[channel];
    if (!providerFactory) {
      throw new Error(`Unsupported channel: ${channel}`);
    }
    return providerFactory();
  }
}
