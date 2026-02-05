import { env } from "../env";

export function formatMqKey(key: string) {
  return `${env.QUEUE_PREFIX}:${key}`;
}

