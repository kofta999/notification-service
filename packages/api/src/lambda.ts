import { handle } from "hono/aws-lambda";
import app from "./app";
import { createLogger } from "shared/logger";

const logger = createLogger("api-lambda");

export const handler = async (event: unknown, context: unknown) => {
  logger.info("API Lambda invoked");
  return handle(app)(event as any, context as any);
};
