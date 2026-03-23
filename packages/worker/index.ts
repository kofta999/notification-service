import type { SQSEvent, SQSHandler, SQSRecord } from "aws-lambda";
import { NotificationHandler } from "./lib/notification-handler";
import { createLogger } from "shared/logger";
import { notificationTable } from "shared/db";

// 1. Initialize heavy clients OUTSIDE the handler (Cold Start Optimization)
// Lambda keeps these in memory between invocations.
const logger = createLogger("worker-lambda");

// 2. The Lambda Entry Point
export const handler: SQSHandler = async (event: SQSEvent) => {
  logger.info({ recordCount: event.Records.length }, "Lambda invoked by SQS");

  // AWS Pro-Tip: SQS Partial Batch Responses
  // If 1 out of 10 messages fails, we only want to retry that 1.
  const batchItemFailures: Array<{ itemIdentifier: string }> = [];

  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (error) {
      logger.error(
        { error, messageId: record.messageId },
        "Error processing record",
      );
      // Tell AWS this specific message failed so it retries ONLY this one
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};

// 3. The Business Logic
async function processRecord(record: SQSRecord) {
  const notificationId = record.body?.trim();
  if (!notificationId) throw new Error(`Invalid body: ${record.body}`);

  const maybeNotification = await notificationTable.findById(notificationId);

  if (!maybeNotification) {
    logger.warn({ notificationId }, "Notification not found in DB, skipping");
    return; // Returning normally tells AWS to delete the message
  }

  const notification = await notificationTable.markSendingIfQueued(notificationId);

  if (!notification) {
    logger.info(
      { notificationId },
      "Notification is not QUEUED anymore, skipping",
    );
    return;
  }

  const notificationHandler = new NotificationHandler(
    notification,
    notificationTable,
    logger,
  );
  await notificationHandler.handle();
}
