import { db } from ".";
import { Notification } from "./generated/prisma";

export async function processNotification(notification: Notification) {
  // Sends notification
  console.log("SENDING NOTIFICATION", notification);

  // Assume sent successfully
  // Updates DB with new status
  await db.notification.update({
    where: { id: notification.id },
    data: { status: "SENT" },
  });
}
