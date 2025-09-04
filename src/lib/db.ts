import { PrismaClient } from "../generated/prisma";

// This is a workaround to ensure that only one PrismaClient instance is created
// per thread in development mode, even with HMR (Hot Module Replacement) or frequent reloads.
// In production, each import will create a new instance, which is generally fine
// as the process will be long-lived and restarts are managed externally.
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export function createPrisma(): PrismaClient {
  let prisma: PrismaClient;

  if (process.env.NODE_ENV === "production") {
    // In production, always create a new PrismaClient instance.
    // Each thread (main or worker) will get its own.
    prisma = new PrismaClient();
  } else {
    // In development, use a global instance to prevent multiple PrismaClient
    // instances from being created by HMR within the same thread (main or worker).
    if (!global.prisma) {
      global.prisma = new PrismaClient();
    }
    prisma = global.prisma;
  }

  return prisma;
}
