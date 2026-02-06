import type { Notification } from "shared/prisma/client";

export type SendError<T extends string> =
  {
    success: false;
    error: {
      type: T;
      message: string;
    };
  };

export type SendSuccess =
   {
      success: true;
    };

export interface IProvider<ErrorType extends string> {
  send(notification: Notification): Promise<SendError<ErrorType> | SendSuccess>;
}
