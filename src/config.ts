import { z } from "zod";
import * as dotenv from "dotenv";
dotenv.config();

const configSchema = z.object({
  DATABASE_URL: z
    .string()
    .default(
      "postgresql://notification_user:notification_password@localhost:5432/notification_db",
    ),
  REDIS_URL: z.string().default("localhost:6379"),
  QUEUE_PREFIX: z.string().default("redis_mq"),
  MAX_RETRIES: z.coerce.number().positive().default(3),
  NUM_THREADS: z.coerce.number().positive().default(1),
  BACKOFF_EXPONENTIAL_FACTOR: z.coerce.number().positive().default(2),
  BACKOFF_BASE_DELAY_MS: z.coerce.number().positive().default(500),
  REAPING_INTERVAL_MINS: z.coerce.number().positive().default(1),
  RECONCILIATION_INTERVAL_MINS: z.coerce.number().positive().default(1),
});

const parsedConfig = configSchema.safeParse(process.env);

if (!parsedConfig.success) {
  console.error(
    "Invalid configuration:",
    parsedConfig.error.flatten().fieldErrors,
  );
  throw new Error("Invalid configuration");
}

export const config = parsedConfig.data;
