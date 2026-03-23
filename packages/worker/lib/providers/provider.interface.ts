import type { Notification } from "shared/db";

export interface IProvider {
  send(notification: Notification): Promise<void>;
}
