import { pino, transport } from "pino";

const lokiTransport = transport({
  targets: [
    {
      target: "pino-loki",
      options: {
        batching: true,
        interval: 5,
        host: "http://localhost:3100",
      },
    },
    {
      target: "pino-pretty",
      options: { destination: 1 },
    },
  ],
});

export function createLogger(serviceName?: string) {
  return pino(
    {
      name: serviceName,
      base: serviceName ? { service: serviceName } : {},
    },
    lokiTransport,
  );
}

// Export a default logger for modules that don't need a specific serviceName context
export const logger = createLogger();
