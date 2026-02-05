import type { Notification } from "shared/prisma/client";

export type SendResult<T = string> =
  | {
      success: false;
      error: {
        type: T;
        message: string;
      };
    }
  | {
      success: true;
    };

export interface IProvider<ErrorType extends string> {
  send(notification: Notification): Promise<SendResult<ErrorType>>;
}
