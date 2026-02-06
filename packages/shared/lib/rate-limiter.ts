import Redis from "ioredis";

/** Uses Fixed Window Algorithm */
export class RateLimiter {
  constructor(
    private redis: Redis,
    private key: string,
    private limit: number,
    private expirySecs: number = 1,
  ) {}

  async take(): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const bucketKey = `${this.key}:${now}`;

    const count = await this.redis.incr(bucketKey);

    if (count === 1) {
      await this.redis.expire(bucketKey, this.expirySecs);
    }

    return count <= this.limit;
  }
}
