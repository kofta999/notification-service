import { QUEUE_PREFIX } from "./config";

export function formatMqKey(key: string) {
  return `${QUEUE_PREFIX}:${key}`;
}
