import { setTimeout as sleep } from "node:timers/promises";
import { Notification } from "../../generated/prisma";
import { IProvider, SendResult } from "./provider.interface";

type EmailErrorType = "invalid_email" | "timeout";

export class EmailProvider implements IProvider<EmailErrorType> {
  async send(notification: Notification): Promise<SendResult<EmailErrorType>> {
    const sleepDuration = Math.random() * 10000;
    await sleep(sleepDuration);

    if (sleepDuration >= 5000) {
      return {
        success: false,
        error: { type: "timeout", message: "Failed to send email" },
      };
    }

    return { success: true };
  }
}
