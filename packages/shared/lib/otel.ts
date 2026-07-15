import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { env } from "../env";

// Point this to your Grafana Alloy service in Kubernetes.
// Alloy's default OTLP HTTP receiver listens on port 4318.
const traceExporter = new OTLPTraceExporter({
  url: env.TEMPO_URL,
});

const sdk = new NodeSDK({
  traceExporter,
  // This automatically instruments supported libraries (HTTP, Express, Postgres, etc.)
  instrumentations: [getNodeAutoInstrumentations()],
  serviceName: "notification-service",
});

// Start the SDK
sdk.start();
console.log("OpenTelemetry SDK initialized");

// Ensure the SDK shuts down cleanly when Bun exits
process.on("SIGTERM", () => {
  sdk.shutdown()
    .then(() => console.log("Tracing terminated"))
    .catch((error) => console.log("Error terminating tracing", error))
    .finally(() => process.exit(0));
});
