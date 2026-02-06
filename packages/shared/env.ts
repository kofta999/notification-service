import { z } from "zod";
import * as dotenv from "dotenv";
dotenv.config({ quiet: true, path: ["./config/api.env", "./config/db.env"] });

const envSchema = z.object({
  APP_PORT: z.coerce.number().positive().default(3000),
  POSTGRES_USER: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DB: z.string(),
  POSTGRES_HOST: z.string(),
  REDIS_URL: z.string(),
  LOKI_URL: z.string(),
  QUEUE_PREFIX: z.string(),
  MAX_RETRIES: z.coerce.number().positive(),
  NUM_THREADS: z.coerce.number().positive(),
  BACKOFF_EXPONENTIAL_FACTOR: z.coerce.number().positive(),
  BACKOFF_BASE_DELAY_MS: z.coerce.number().positive(),
  REAPING_INTERVAL_MINS: z.coerce.number().positive(),
  RATE_LIMIT_REQUEUE_DELAY_MS: z.coerce.number().positive(),
  RECONCILIATION_INTERVAL_MINS: z.coerce.number().positive(),
});

const parsedConfig = envSchema.safeParse(process.env);

if (!parsedConfig.success) {
  console.error(
    "Invalid configuration:",
    parsedConfig.error.flatten().fieldErrors,
  );
  throw new Error("Invalid configuration");
}

export const env = parsedConfig.data;
