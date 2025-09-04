// metrics.ts
import { Counter, Registry, Gauge, register } from "prom-client";
import { workerMetrics } from "./worker/metrics";

// Default metrics (Node.js event loop, memory, GC, etc.)
//collectDefaultMetrics({ register });

// API (Enqueuer) metrics
const api_jobs_enqueued_total = new Counter({
  name: "api_jobs_enqueued_total",
  help: "Total jobs enqueued into Redis by the API",
});
const api_jobs_enqueue_failed_total = new Counter({
  name: "api_jobs_enqueue_failed_total",
  help: "Total jobs that failed to enqueue into Redis by the API",
});

// Reaper metrics
const reaper_runs_total = new Counter({
  name: "reaper_runs_total",
  help: "How many times the reaper ran",
});
const reaper_stuck_jobs_detected_total = new Counter({
  name: "reaper_stuck_jobs_detected_total",
  help: "Stuck jobs found in SENDING state",
});
const reaper_stuck_jobs_requeued_total = new Counter({
  name: "reaper_stuck_jobs_requeued_total",
  help: "Stuck jobs reset and re-enqueued",
});

// Reconciler metrics
const reconciler_runs_total = new Counter({
  name: "reconciler_runs_total",
  help: "How many times the reconciler ran",
});
const reconciler_jobs_detected_total = new Counter({
  name: "reconciler_jobs_detected_total",
  help: "Jobs found QUEUED in DB but missing in Redis",
});
const reconciler_jobs_requeued_total = new Counter({
  name: "reconciler_jobs_requeued_total",
  help: "Jobs re-enqueued by the reconciler",
});

// Gauges (snapshots)
// Needs a custom job (won't do it for now)
// const queue_depth = new Gauge({
//   name: "queue_depth",
//   help: "Current Redis queue length",
// });
const db_queued_notifications = new Gauge({
  name: "db_queued_notifications",
  help: "Rows in DB with status = QUEUED",
});
const db_sending_notifications = new Gauge({
  name: "db_sending_notifications",
  help: "Rows in DB with status = SENDING",
});

// Export all metrics
export const metrics = {
  register,
  // API
  api_jobs_enqueued_total,
  api_jobs_enqueue_failed_total,
  // Reaper
  reaper_runs_total,
  reaper_stuck_jobs_detected_total,
  reaper_stuck_jobs_requeued_total,
  // Worker
  ...workerMetrics,
  // Reconciler
  reconciler_runs_total,
  reconciler_jobs_detected_total,
  reconciler_jobs_requeued_total,
  // Gauges
  // queue_depth,
  db_queued_notifications,
  db_sending_notifications,
};
