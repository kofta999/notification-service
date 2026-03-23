import { setTimeout as sleep } from "node:timers/promises";
import { ThirdPartyProviderError } from "shared/errors";
import type { Notification } from "shared/db";
import type { IProvider } from "./provider.interface";

export class SmsProvider implements IProvider {
  async send(notification: Notification): Promise<void> {
    const sleepDuration = Math.random() * 10000;
    await sleep(sleepDuration);

    if (sleepDuration >= 5000) {
      throw new ThirdPartyProviderError(
        `SMS provider temporary failure for notification ${notification.id}`,
      );
    }
  }
}
