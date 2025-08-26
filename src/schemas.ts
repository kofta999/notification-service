import z from "zod";

export const NotifyRequestSchema = z.object({
  recipientId: z.string(),
  channel: z.enum(["email", "sms", "push"]),
  channelAddress: z.union([z.string(), z.email()]),
  payload: z.looseObject({}),
});
