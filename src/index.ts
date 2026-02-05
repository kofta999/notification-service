import app, { queue, redis } from "./app";
import "./jobs/reaper";
import "./jobs/reconciler";
import { env } from "./env";
import { existsSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { MetricObjectWithValues, MetricValue } from "prom-client";
import { metrics } from "./lib/metrics";
import type { workerMetrics } from "./worker/metrics";
import { createLogger } from "./lib/logger";

const logger = createLogger("main");

const server = Bun.serve({ port: env.APP_PORT, fetch: app.fetch });
logger.info(`Server up and listening on port ${env.APP_PORT}`);

const workerPath = "./src/worker/worker-loop.ts";

if (!existsSync(workerPath)) {
  logger.error(`Worker file not found: ${workerPath}`);
  process.exit(1);
}

for (let i = 0; i < env.NUM_THREADS; ++i) {
  const worker = new Worker(workerPath, { workerData: { workerId: i } });
  worker.on(
    "message",
    (sentMetrics: MetricObjectWithValues<MetricValue<string>>[]) => {
      for (const metric of sentMetrics) {
        const { name, values } = metric as {
          name: keyof typeof workerMetrics;
          values: MetricValue<string>[];
        };
        metrics[name].inc(values[0].value);
      }

      logger.debug({ workerId: i }, "Metrics updated");
    },
  );
  logger.info({ workerId: i }, `Worker is running`);
}

process.on("SIGINT", async () => {
  // 1. Stop accepting new requests
  // 2. Wait for in-flight jobs to complete
  // 3. Close DB connections
  // 4. Close Redis connections
  // 5. Exit
  logger.info("SIGTERM received, starting graceful shutdown");

  await server.stop();
  await Bun.sleep(3000);
  if (server.pendingRequests > 0) {
    logger.warn(
      `${server.pendingRequests} pending requests remain after timeout, cancelling all requests`,
    );
    await server.stop(true);
  }

  await prisma?.$disconnect();
  await redis.quit();

  process.exit(0);
});
