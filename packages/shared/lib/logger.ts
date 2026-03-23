import { pino, transport, type Logger, type TransportSingleOptions } from "pino";
import { env } from "../env";

function isLambdaRuntime(): boolean {
  return Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV?.includes("AWS_Lambda"),
  );
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function buildLoggerOptions(serviceName?: string) {
  return {
    name: serviceName,
    base: serviceName ? { service: serviceName } : {},
    level: process.env.LOG_LEVEL || (isProduction() ? "info" : "debug"),
  };
}

function buildTransport(): ReturnType<typeof transport> | undefined {
  // Lambda-safe path: avoid pino-loki transport target resolution in bundled runtimes.
  // Let logs go to stdout/stderr (CloudWatch).
  if (isLambdaRuntime()) {
    return undefined;
  }

  const targets: TransportSingleOptions[] = [];

  if (env.LOKI_URL) {
    targets.push({
      target: "pino-loki",
      options: {
        batching: true,
        interval: 5,
        host: env.LOKI_URL,
      },
    });
  }

  if (!isProduction()) {
    targets.push({
      target: "pino-pretty",
      options: { destination: 1 },
    });
  }

  if (targets.length === 0) {
    return undefined;
  }

  return transport({ targets });
}

export function createLogger(serviceName?: string): Logger {
  const options = buildLoggerOptions(serviceName);
  const loggerTransport = buildTransport();

  if (loggerTransport) {
    return pino(options, loggerTransport);
  }

  // Default safe logger (JSON to stdout), ideal for Lambda/CloudWatch.
  return pino(options);
}

// Default logger for modules without explicit service context.
export const logger = createLogger();
