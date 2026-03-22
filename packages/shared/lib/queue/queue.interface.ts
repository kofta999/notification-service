export interface IQueue<T> {
  enqueue(...items: T[]): Promise<void>;
  dequeue(): Promise<T | null>;
  length(): Promise<number>;
}
