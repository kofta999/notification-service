import type { Context, Next } from "hono";
import { createLogger } from "shared/logger";
import { apiKeyTable } from "shared/db";

const logger = createLogger("auth-middleware");

export async function apiKeyAuth(c: Context, next: Next) {
  const apiKey = c.req.header("x-api-key");

  if (!apiKey) {
    logger.warn("Missing API key");
    return c.json({ error: "API key required" }, 401);
  }

  const key = await apiKeyTable.findByKey(apiKey);

  if (!key || !apiKeyTable.isUsable(key)) {
    logger.warn({ apiKey: `${apiKey.slice(0, 8)}...` }, "Invalid or expired API key");
    return c.json({ error: "Invalid or expired API key" }, 401);
  }

  apiKeyTable
    .touchLastUsed(key.id)
    .catch((err: unknown) => {
      logger.error({ err }, "Failed to update lastUsedAt");
    });

  c.set("apiKey", key);
  logger.info({ keyName: key.name }, "API key authenticated");

  await next();
}
