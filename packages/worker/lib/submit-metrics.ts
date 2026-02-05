// TODO
import { register } from "prom-client";

/** Sends worker thread metrics into the main thread */
async function submitMetrics() {
  const metrics = await register.getMetricsAsJSON();
  register.resetMetrics();
}

// Send every 10s
setInterval(submitMetrics, 10 * 1000);
