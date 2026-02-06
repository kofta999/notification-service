import { NotificationError } from "shared/errors";
import type { Context, Next } from "hono";

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    if (error instanceof NotificationError) {
      c.status(400);
      return c.json({
        error: {
          message: error.message,
          retryable: error.retryable,
        },
      });
    }

    c.status(500);
    return c.json({
      error: {
        message: "Internal server error",
      },
    });
  }
}
