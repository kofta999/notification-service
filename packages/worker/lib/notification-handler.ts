import { setTimeout as sleep } from "node:timers/promises";
import type { Notification, PrismaClient } from "shared/prisma/client";
import { env } from "shared/env";
import { calculateBackoffDelay } from "./util";
import { Queue } from "shared/queue";
import { workerMetrics } from "./metrics";
import type { Logger } from "pino";
import { EmailProvider } from "./providers/email.provider";
import { PushNotificationProvider } from "./providers/push-notification.provider";
import { SmsProvider } from "./providers/sms.provider";
import type { IProvider, SendError } from "./providers/provider.interface";

export class NotificationHandler {
	private providerMap: Record<
		Notification["channel"],
		() => IProvider<any>
	> = {
		email: () => new EmailProvider(),
		sms: () => new SmsProvider(),
		push: () => new PushNotificationProvider(),
	};

	constructor(
		private notification: Notification,
		private db: PrismaClient,
		private queue: Queue,
		private parentLogger: Logger,
	) {}

	async handle() {
		const logger = this.parentLogger.child({
			notificationId: this.notification.id,
		});
		logger.info({ channel: this.notification.channel }, "Sending notification");

		try {
			const provider = this.getProvider(this.notification.channel);
			const result = await provider.send(this.notification);

			if (result.success) {
				await this.handleSuccess(logger);
			} else {
				await this.handleFailure(logger, result);
			}
		} catch (error) {
			logger.error({ error }, "Unexpected error");
		} finally {
			logger.debug("Finished processing notification");
		}
	}

	private async handleSuccess(log: Logger) {
		await this.db.notification.update({
			where: { id: this.notification.id },
			data: { status: "SENT" },
		});

		workerMetrics.worker_jobs_sent_total.inc();
		log.info("Notification sent successfully");
	}

	private async handleFailure(log: Logger, error: SendError<string>) {
		log.error(
			{ error: error.error.type, retries: this.notification.retries },
			"Error sending notification",
		);

		if (this.notification.retries < env.MAX_RETRIES) {
			await this.requeueNotification(log);
		} else {
			await this.markAsFailed(log);
		}
	}

	private async requeueNotification(log: Logger) {
		const delay = calculateBackoffDelay(
			this.notification.retries,
			env.BACKOFF_EXPONENTIAL_FACTOR,
			env.BACKOFF_BASE_DELAY_MS,
		);

		log.warn(
			{ delay, retries: this.notification.retries + 1 },
			"Requeueing notification",
		);
		await sleep(delay);

		await this.db.notification.update({
			where: { id: this.notification.id },
			data: { retries: { increment: 1 }, status: "QUEUED" },
		});

		await this.queue.enqueue(this.notification.id);

		workerMetrics.worker_jobs_retried_total.inc();

		log.info("Notification requeued successfully");
	}

	private async markAsFailed(log: Logger) {
		log.error("Notification failed after max retries");
		await this.db.notification.update({
			where: { id: this.notification.id },
			data: { status: "FAILED" },
		});

		workerMetrics.worker_jobs_failed_total.inc();
	}

	private getProvider(channel: Notification["channel"]): IProvider<any> {
		const providerFactory = this.providerMap[channel];
		if (providerFactory) {
			return providerFactory();
		}
		throw new Error(`Unsupported channel: ${channel}`);
	}
}
