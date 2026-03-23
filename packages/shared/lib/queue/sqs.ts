import {
  SendMessageBatchCommand,
  SQSClient,
  ReceiveMessageCommand,
  GetQueueAttributesCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";

export class SqsQueue {
  constructor(
    private url: string,
    private client: SQSClient,
  ) {}

  async enqueue(...items: string[]): Promise<void> {
    const BATCH_SIZE = 10;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const chunk = items.slice(i, i + BATCH_SIZE);

      await this.client.send(
        new SendMessageBatchCommand({
          QueueUrl: this.url,
          Entries: chunk.map((id, index) => ({
            Id: `msg_${i + index}`,
            MessageBody: id,
          })),
        }),
      );
    }
  }

  async dequeue(): Promise<{ id: string; receiptHandle: string } | null> {
    const res = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.url,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
      }),
    );

    const message = res.Messages?.[0];
    if (!message || !message.Body || !message.ReceiptHandle) return null;

    return {
      id: message.Body,
      receiptHandle: message.ReceiptHandle,
    };
  }

  async ack(receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: this.url,
        ReceiptHandle: receiptHandle,
      }),
    );
  }

  async length(): Promise<number> {
    const res = await this.client.send(
      new GetQueueAttributesCommand({
        QueueUrl: this.url,
        AttributeNames: ["ApproximateNumberOfMessages"],
      }),
    );

    return Number.parseInt(res.Attributes?.ApproximateNumberOfMessages || "0", 10);
  }
}
