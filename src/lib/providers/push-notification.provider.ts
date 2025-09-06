import { setTimeout as sleep } from "node:timers/promises";
import { Notification } from "../../generated/prisma";
import { IProvider, SendResult } from "./provider.interface";

type PushNotificationErrorType = "timeout";

export class PushNotificationProvider
  implements IProvider<PushNotificationErrorType>
{
  async send(
    notification: Notification,
  ): Promise<SendResult<PushNotificationErrorType>> {
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
