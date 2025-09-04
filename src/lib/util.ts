import { env } from "../env";

export function formatMqKey(key: string) {
  return `${env.QUEUE_PREFIX}:${key}`;
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
