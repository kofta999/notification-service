import type { Notification } from "shared/prisma/client";

export interface IProvider {
  send(notification: Notification): Promise<void>;
}
