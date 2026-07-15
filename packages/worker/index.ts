import { Queue } from "shared/queue";
import { NotificationHandler } from "./lib/notification-handler";
import Redis from "ioredis";
import { workerMetrics } from "./lib/metrics";
import { register } from "prom-client";
import { env } from "shared/env";
import { createLogger } from "shared/logger";
import { createPrisma } from "shared/db";
import { RateLimiter } from "shared/rate-limiter";
import { setTimeout } from "node:timers";
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { PrismaClient, Notification } from "shared/prisma/client";
import type { Logger } from "pino";
import { httpInstrumentationMiddleware } from "@hono/otel";
import "shared/otel";

class Worker {
	private id: string;
	private logger: Logger;
	private db: PrismaClient;
	private redis: Redis;
	private queue: Queue;
	private rateLimiters: Record<Notification["channel"], RateLimiter>;
	private app: Hono;
	private CONCURRENCY: number

	constructor() {
		this.id = process.env.WORKER_ID ?? randomUUID();
		this.logger = createLogger(`worker-${this.id}`);
		this.db = createPrisma();
		this.redis = new Redis(env.REDIS_URL);
		this.queue = new Queue({
			queueName: "test",
			redis: this.redis,
			timeoutSecs: 5,
		});

		this.rateLimiters = {
			email: new RateLimiter(this.redis, "rate:email", 100),
			sms: new RateLimiter(this.redis, "rate:sms", 100),
			push: new RateLimiter(this.redis, "rate:push", 100),
		};

		this.app = new Hono();
    this.CONCURRENCY = env.WORKER_CONCURRENCY;
	}

	private setupMetricsServer() {
	  this.app.use(httpInstrumentationMiddleware())
		this.app.get("/metrics", async (c) => {
			this.logger.info("Metrics endpoint accessed");
			c.header("Content-Type", register.contentType);
			const metrics = await register.metrics();
			return c.text(metrics);
		});

		Bun.serve({
			port: 9001,
			fetch: this.app.fetch,
		});

		this.logger.info("Metrics server running on port 9001");
	}

	public async start() {
		this.logger.info("Worker starting...");
		this.setupMetricsServer();
		await this.workerLoop();
	}

	private async workerLoop() {
		this.logger.info(`Worker started, concurrency count: ${this.CONCURRENCY}`);
		const activeJobs = new Set<Promise<void>>();

		while (true) {
			if (activeJobs.size >= this.CONCURRENCY) {
				await Promise.race(activeJobs);
			}

			const notificationId = await this.queue.dequeue();

			if (notificationId) {
				workerMetrics.worker_jobs_picked_up_total.inc();
				const childLogger = this.logger.child({ notificationId });
				childLogger.info("Dequeued notification");

				const job = this.processNotification(notificationId)
					.catch((error) => {
						childLogger.error({ error }, "Error processing notification");
					})
					.finally(() => {
						activeJobs.delete(job);
					});

				activeJobs.add(job);
			}
		}
	}

	private async processNotification(notificationId: number) {
		const maybeNotification = await this.db.notification.findUnique({
			where: { id: notificationId },
			select: { channel: true },
		});

		if (!maybeNotification) {
			this.logger.warn({ notificationId }, "Notification not found, skipping");
			return;
		}

		const rateLimiter = this.rateLimiters[maybeNotification.channel];

		if (await rateLimiter.take()) {
			const notification = await this.db.notification.update({
				where: { id: notificationId, status: "QUEUED" },
				data: { status: "SENDING" },
			});

			const handler = new NotificationHandler(
				notification,
				this.db,
				this.queue,
				this.logger,
			);
			await handler.handle();
		} else {
			this.requeue(
				notificationId,
				"Rate limit exceeded for notification, re-queueing",
			);
		}
	}

	private requeue(notificationId: number, reason: string) {
		this.logger.warn({ notificationId }, reason);
		setTimeout(
			() => this.queue.enqueue(notificationId),
			env.WORKER_RATE_LIMIT_REQUEUE_DELAY_MS,
		);
	}
}

const worker = new Worker();
await worker.start();
