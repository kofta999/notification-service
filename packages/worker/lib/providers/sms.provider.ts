import { setTimeout as sleep } from "node:timers/promises";
import type { Notification } from "shared/prisma/client";
import type { IProvider, SendError, SendSuccess } from "./provider.interface";

type SmsErrorType = "invalid_number" | "timeout";

export class SmsProvider implements IProvider<SmsErrorType> {
  async send(notification: Notification): Promise<SendError<SmsErrorType> | SendSuccess> {
    const sleepDuration = Math.random() * 10000;
    await sleep(sleepDuration);

    if (sleepDuration >= 5000) {
      return {
        success: false,
        error: { type: "timeout", message: "Failed to send sms" },
      };
    }

    return { success: true };
  }
}
