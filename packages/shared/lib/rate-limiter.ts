import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { db } from "./db";
import { env } from "../env";

/**
 * DynamoDB fixed-window rate limiter.
 *
 * Partition/Sort key model:
 *  pk = RATE_LIMIT#<scopeKey>
 *  sk = WINDOW#<windowStartEpochSec>
 *
 * Required table assumptions:
 * - Same table as app data (default: notification_db) or whichever `db` is configured for.
 * - TTL enabled on attribute `expiresAt` (epoch seconds) for automatic cleanup.
 */
export class RateLimiter {
  constructor(
    private key: string,
    private limit: number,
    private windowSecs: number = 60,
  ) {}

  /**
   * Consumes one token from the current fixed window.
   * Returns true if request is allowed, false if rate-limited.
   */
  async take(): Promise<boolean> {
    const nowSec = Math.floor(Date.now() / 1000);
    const windowStart = nowSec - (nowSec % this.windowSecs);
    const expiresAt = windowStart + this.windowSecs * 2; // keep one extra window for safety

    try {
      const result = await db.client.send(
        new UpdateCommand({
          TableName: env.DYNAMODB_RATE_LIMIT_TABLE_NAME ?? "notification_rate_limits",
          Key: {
            pk: `RATE_LIMIT#${this.key}`,
            sk: `WINDOW#${windowStart}`,
          },
          UpdateExpression:
            "SET #count = if_not_exists(#count, :zero) + :one, expiresAt = :expiresAt, entityType = :entityType, updatedAt = :updatedAt, createdAt = if_not_exists(createdAt, :createdAt)",
          ConditionExpression:
            "attribute_not_exists(#count) OR #count < :limit",
          ExpressionAttributeNames: {
            "#count": "count",
          },
          ExpressionAttributeValues: {
            ":zero": 0,
            ":one": 1,
            ":limit": this.limit,
            ":expiresAt": expiresAt,
            ":entityType": "RATE_LIMIT",
            ":updatedAt": new Date().toISOString(),
            ":createdAt": new Date().toISOString(),
          },
          ReturnValues: "UPDATED_NEW",
        }),
      );

      const count = Number(result.Attributes?.count ?? 0);
      return count <= this.limit;
    } catch {
      // Conditional check failed => window exceeded.
      return false;
    }
  }
}
