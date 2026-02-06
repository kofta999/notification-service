import { createPrisma } from "shared/db";
import { randomBytes } from "crypto";

const db = createPrisma();

function generateApiKey(): string {
  // Format: noti_live_32randomchars or noti_test_32randomchars
  const prefix =
    process.env.NODE_ENV === "production" ? "noti_live" : "noti_test";
  const random = randomBytes(16).toString("hex");
  return `${prefix}_${random}`;
}

async function createApiKey(name: string, rateLimit: number = 100) {
  const key = generateApiKey();

  const apiKey = await db.apiKey.create({
    data: {
      key,
      name,
      rateLimit,
    },
  });

  console.log("\n✅ API Key Created:");
  console.log("━".repeat(60));
  console.log(`Name:       ${apiKey.name}`);
  console.log(`Key:        ${apiKey.key}`);
  console.log(`Rate Limit: ${apiKey.rateLimit} requests/minute`);
  console.log(`Created:    ${apiKey.createdAt}`);
  console.log("━".repeat(60));
  console.log("\n⚠️  Store this key securely - it won't be shown again!\n");

  return apiKey;
}

async function listApiKeys() {
  const keys = await db.apiKey.findMany({
    select: {
      id: true,
      name: true,
      isActive: true,
      rateLimit: true,
      createdAt: true,
      lastUsedAt: true,
      key: true,
    },
  });

  console.log("\n📋 API Keys:");
  console.log("━".repeat(80));
  keys.forEach((k) => {
    console.log(`${k.isActive ? "✅" : "❌"} ${k.name}`);
    console.log(`   Key: ${k.key.slice(0, 20)}...`);
    console.log(
      `   Rate: ${k.rateLimit}/min | Last used: ${k.lastUsedAt || "Never"}`,
    );
    console.log("");
  });
}

async function revokeApiKey(keyId: number) {
  await db.apiKey.update({
    where: { id: keyId },
    data: { isActive: false },
  });
  console.log(`✅ API Key #${keyId} revoked`);
}

// CLI interface
const command = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

switch (command) {
  case "create":
    await createApiKey(arg1, arg2 ? parseInt(arg2) : 100);
    break;
  case "list":
    await listApiKeys();
    break;
  case "revoke":
    await revokeApiKey(parseInt(arg1));
    break;
  default:
    console.log("Usage:");
    console.log(
      "  bun run scripts/manage-api-keys.ts create <name> [rateLimit]",
    );
    console.log("  bun run scripts/manage-api-keys.ts list");
    console.log("  bun run scripts/manage-api-keys.ts revoke <id>");
}

await db.$disconnect();
