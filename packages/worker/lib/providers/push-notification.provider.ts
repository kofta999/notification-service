import { setTimeout as sleep } from "node:timers/promises";
import type { Notification } from "shared/prisma/client";
import type { IProvider, SendError, SendSuccess } from "./provider.interface";

type PushNotificationErrorType = "timeout";

export class PushNotificationProvider implements IProvider<PushNotificationErrorType> {
  async send(
    notification: Notification,
  ): Promise<SendError<PushNotificationErrorType> | SendSuccess> {
    const sleepDuration = Math.random() * 10000;
    await sleep(sleepDuration);

    if (sleepDuration >= 5000) {
      return {
        success: false,
        error: { type: "timeout", message: "Failed to send notification" },
      };
    }

    return { success: true };
  }
}
