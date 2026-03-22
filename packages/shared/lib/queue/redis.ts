import Redis from "ioredis";
import { formatMqKey } from "../util";
import type { IQueue } from "./queue.interface";

type QueueConfig = {
  redis: Redis;
  queueName: string;
  timeoutSecs: number
};

export class RedisQueue implements IQueue<number> {
  private config: QueueConfig;

  // 5s is default timeout if not provided
  constructor(config: QueueConfig) {
    this.config = config
  }

  async enqueue(...items: number[]): Promise<void> {
    await this.config.redis.lpush(
      this.generateQueueKey(),
      ...items.map((item) => item.toString()),
    );
  }

  async dequeue(): Promise<number | null> {
    const res = await this.config.redis.brpop(
      this.generateQueueKey(),
      this.config.timeoutSecs,
    );

    if (res) {
      return parseInt(res[1], 10);
    }

    return null;
  }

  async length(): Promise<number> {
    return this.config.redis.llen(this.generateQueueKey());
  }

  private generateQueueKey() {
    return formatMqKey(this.config.queueName);
  }
}
