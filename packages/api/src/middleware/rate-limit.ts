import { RateLimiter } from "shared/rate-limiter";
import type { Context, Next } from "hono";
import { env } from "shared/env";

const limiters = new Map<string, RateLimiter>();

export async function apiRateLimit(c: Context, next: Next) {
  const apiKey = c.get("apiKey");

  if (!apiKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const limiterKey = String(apiKey.id);

  let limiter = limiters.get(limiterKey);
  if (!limiter) {
    limiter = new RateLimiter(
      `api_rate_limit:${limiterKey}`,
      apiKey.rateLimit,
      60,
    );
    limiters.set(limiterKey, limiter);
  }

  const allowed = await limiter.take();

  if (!allowed) {
    return c.json(
      {
        error: "Rate limit exceeded",
        limit: apiKey.rateLimit,
        window: "60s",
      },
      429,
    );
  }

  await next();
}
