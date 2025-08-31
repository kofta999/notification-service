import { serve } from "@hono/node-server";
import app from "./app";
import "./jobs/reaper";
import "./jobs/reconciler";
import { config } from "./config";
import { existsSync } from "node:fs";
import { Worker } from "node:worker_threads";
import {
  MetricObjectWithValues,
  MetricValue,
  register,
  Registry,
} from "prom-client";
import { metrics } from "./metrics";

serve(app);
console.log("Server up and listening on port 3000");

const workerPath = "./src/worker/worker-loop.ts";

if (!existsSync(workerPath)) {
  console.error(`Worker file not found: ${workerPath}`);
  process.exit(1);
}

for (let i = 0; i < config.NUM_THREADS; ++i) {
  const worker = new Worker(workerPath);
  worker.on(
    "message",
    (sentMetrics: MetricObjectWithValues<MetricValue<string>>[]) => {
      for (const { name, values } of sentMetrics) {
        // @ts-ignore
        metrics[name].inc(values[0].value);
      }

      console.log("Metrics updated from workers");
    },
  );
  console.log(`Worker ${i} is running`);
}
