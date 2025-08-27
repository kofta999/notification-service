import type { Notification } from "./generated/prisma";

interface IQueue<T> {
  enqueue(item: T): void;
  dequeue(): T | undefined;
  isEmpty(): boolean;
}

class Queue<T> implements IQueue<T> {
  private queue: Array<T>;

  constructor() {
    this.queue = [];
  }

  enqueue(item: T): void {
    this.queue.push(item);
  }

  dequeue(): T | undefined {
    return this.queue.shift();
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }
}

export const queue = new Queue<Notification>();
