import { config } from "./config";

export function formatMqKey(key: string) {
  return `${config.QUEUE_PREFIX}:${key}`;
}

export function calculateBackoffDelay(
  retryCount: number,
  exponentialFactor: number,
  baseDelayMs: number,
  maxDelayMs: number = 30000,
  jitterFactor: number = 0,
): number {
  let delay = baseDelayMs * Math.pow(exponentialFactor, retryCount);
  delay = Math.min(maxDelayMs, delay);
  const jitter = Math.random() * jitterFactor;
  delay += jitter;

  return delay;
}
