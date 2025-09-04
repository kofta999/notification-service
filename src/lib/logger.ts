import { pino } from "pino";

export function createLogger(serviceName?: string) {
  return pino({
    name: serviceName,
    base: serviceName ? { service: serviceName } : {},
  });
}

export const logger = createLogger();
