import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true, path: "./config/.env" });

const envSchema = z.object({
  // API
  API_APP_PORT: z.coerce.number().positive().default(3000),

  // App queue key namespace
  QUEUE_PREFIX: z.string().min(1).default("notification"),

  // AWS / DynamoDB
  AWS_REGION: z.string().default("us-east-1"),
  DYNAMODB_NOTIFICATION_TABLE_NAME: z
    .string()
    .min(1)
    .default("notification_db"),
  DYNAMODB_API_KEY_TABLE_NAME: z
    .string()
    .min(1)
    .default("notification_api_keys"),
  DYNAMODB_RATE_LIMIT_TABLE_NAME: z
    .string()
    .min(1)
    .default("notification_rate_limits"),
  NOTIFICATION_QUEUE_URL: z.string().min(1),

  // Optional local/dev overrides
  DYNAMODB_ENDPOINT: z.string().optional(),

  // Logging
  LOKI_URL: z.string().optional(),
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
