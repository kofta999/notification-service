import { Counter } from "prom-client";

// Worker / Dispatcher metrics
const worker_jobs_picked_up_total = new Counter({
  name: "worker_jobs_picked_up_total",
  help: "Jobs dequeued from Redis by workers",
});
const worker_jobs_sent_total = new Counter({
  name: "worker_jobs_sent_total",
  help: "Jobs successfully processed and marked sent",
});
const worker_jobs_failed_total = new Counter({
  name: "worker_jobs_failed_total",
  help: "Jobs permanently failed after retries",
});
const worker_jobs_retried_total = new Counter({
  name: "worker_jobs_retried_total",
  help: "Jobs retried due to transient error",
});
// const worker_processing_duration_seconds = new Histogram({
//   name: "worker_processing_duration_seconds",
//   help: "Time taken by workers to process a job",
//   buckets: [0.1, 0.5, 1, 2, 5, 10], // seconds
// });

export const workerMetrics = {
  // Worker
  worker_jobs_picked_up_total,
  worker_jobs_sent_total,
  worker_jobs_failed_total,
  worker_jobs_retried_total,
  // worker_processing_duration_seconds,
};
