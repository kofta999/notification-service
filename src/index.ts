import { serve } from "@hono/node-server";
import app from "./app";
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

serve(app);
logger.info("Server up and listening on port 3000");

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

      logger.info({ workerId: i }, "Metrics updated");
    },
  );
  logger.info({ workerId: i }, `Worker is running`);
}
