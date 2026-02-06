import app, { redis } from "./app";
import "./jobs/reaper";
import "./jobs/reconciler";
import { env } from "shared/env";
import { createLogger } from "shared/logger";

const logger = createLogger("API");

const server = Bun.serve({ port: env.APP_PORT, fetch: app.fetch });
logger.info(`Server up and listening on port ${env.APP_PORT}`);

async function gracefulShutdown() {
  await server.stop();
  await Bun.sleep(5000);
  if (server.pendingRequests > 0) {
    logger.warn(
      `${server.pendingRequests} pending requests remain after timeout, cancelling all requests`,
    );
    await server.stop(true);
  }

  await prisma?.$disconnect();
  await redis.quit();

  process.exit(0);
}

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, starting graceful shutdown");
  await gracefulShutdown();
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, starting graceful shutdown");
  await gracefulShutdown();
});
