import type { Context, Next } from "hono";
import { db } from "../app";
import { createLogger } from "shared/logger";

const logger = createLogger("auth-middleware");

export async function apiKeyAuth(c: Context, next: Next) {
  const apiKey = c.req.header("x-api-key");

  if (!apiKey) {
    logger.warn("Missing API key");
    return c.json({ error: "API key required" }, 401);
  }

  const key = await db.apiKey.findFirst({
    where: {
      key: apiKey,
      isActive: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ]
    }
  });

  if (!key) {
    logger.warn({ apiKey: apiKey.slice(0, 8) + "..." }, "Invalid API key");
    return c.json({ error: "Invalid or expired API key" }, 401);
  }

  db.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() }
  }).catch(err => logger.error({ err }, "Failed to update lastUsedAt"));

  c.set("apiKey", key);

  logger.info({ keyName: key.name }, "API key authenticated");

  await next();
}
