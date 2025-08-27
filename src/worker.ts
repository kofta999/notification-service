import { setTimeout as sleep } from "node:timers/promises";
import { db } from ".";
import type { Notification } from "./generated/prisma";

export async function processNotification(notification: Notification) {
  // Send notification
  console.log(`Sending notification with ID: ${notification.id}`);
  try {
    if (notification.channel === "email") {
      await sendEmail(notification);
    }

    await db.notification.update({
      where: { id: notification.id },
      data: { status: "SENT" },
    });

    console.log(`Notification with ID: ${notification.id} is sent`);
  } catch (error) {
    console.log(`Failed to send notification with ID: ${notification.id}`);
    await db.notification.update({
      where: { id: notification.id },
      data: { status: "FAILED" },
    });
  }
}

async function sendEmail(notification: Notification) {
  const sleepDuration = Math.random() * 10000;
  await sleep(sleepDuration);

  if (sleepDuration >= 5000) {
    throw new Error("Failed to send email");
  }
}
