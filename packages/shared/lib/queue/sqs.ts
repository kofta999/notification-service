import {
  SendMessageBatchCommand,
  SQSClient,
  ReceiveMessageCommand,
  GetQueueAttributesCommand,
  DeleteMessageCommand
} from "@aws-sdk/client-sqs";
import type { IQueue } from "./queue.interface";

export class SqsQueue {
  constructor(
    private url: string,
    private client: SQSClient
  ) {}

  async enqueue(...items: number[]): Promise<void> {
    const BATCH_SIZE = 10;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const chunk = items.slice(i, i + BATCH_SIZE);
      await this.client.send(new SendMessageBatchCommand({
        QueueUrl: this.url,
        Entries: chunk.map((id, index) => ({
          Id: `msg_${i + index}`,
          MessageBody: id.toString(),
        }))
      }));
    }
  }

  async dequeue(): Promise<{ id: number; receiptHandle: string } | null> {
    const res = await this.client.send(new ReceiveMessageCommand({
      QueueUrl: this.url,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 20,
    }));

    const message = res.Messages?.[0];
    if (!message || !message.Body || !message.ReceiptHandle) return null;

    return {
      id: parseInt(message.Body, 10),
      receiptHandle: message.ReceiptHandle,
    };
  }

  async ack(receiptHandle: string): Promise<void> {
    await this.client.send(new DeleteMessageCommand({
      QueueUrl: this.url,
      ReceiptHandle: receiptHandle,
    }));
  }

  async length(): Promise<number> {
    const res = await this.client.send(new GetQueueAttributesCommand({
      QueueUrl: this.url,
      AttributeNames: ["ApproximateNumberOfMessages"],
    }));
    return parseInt(res.Attributes?.ApproximateNumberOfMessages || "0", 10);
  }
}
