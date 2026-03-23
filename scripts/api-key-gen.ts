import { randomBytes } from "node:crypto";
import { apiKeyTable, type ApiKeyRecord } from "shared/db";

function generateApiKey(): string {
  const prefix =
    process.env.NODE_ENV === "production" ? "noti_live" : "noti_test";
  const random = randomBytes(16).toString("hex");
  return `${prefix}_${random}`;
}

function formatDate(value: string | null | undefined): string {
  return value ?? "Never";
}

function printUsage() {
  console.log("Usage:");
  console.log("  bun run scripts/api-key-gen.ts create <name> [rateLimit]");
  console.log("  bun run scripts/api-key-gen.ts list");
  console.log("  bun run scripts/api-key-gen.ts revoke <id>");
}

async function createApiKey(
  name: string,
  rateLimit = 100,
): Promise<ApiKeyRecord> {
  if (!name || !name.trim()) {
    throw new Error("Name is required: create <name> [rateLimit]");
  }

  if (!Number.isFinite(rateLimit) || rateLimit <= 0) {
    throw new Error("rateLimit must be a positive number");
  }

  const key = generateApiKey();

  const created = await apiKeyTable.create({
    key,
    name: name.trim(),
    rateLimit,
  });

  console.log("\n✅ API Key Created:");
  console.log("━".repeat(60));
  console.log(`Id:         ${created.id}`);
  console.log(`Name:       ${created.name}`);
  console.log(`Key:        ${created.key}`);
  console.log(`Rate Limit: ${created.rateLimit} requests/minute`);
  console.log(`Created:    ${created.createdAt}`);
  console.log("━".repeat(60));
  console.log("\n⚠️  Store this key securely - it won't be shown again!\n");

  return created;
}

function printApiKeyRow(k: ApiKeyRecord) {
  console.log(`${k.isActive ? "✅" : "❌"} ${k.name}`);
  console.log(`   Id: ${k.id}`);
  console.log(`   Key: ${k.key.slice(0, 20)}...`);
  console.log(
    `   Rate: ${k.rateLimit}/min | Last used: ${formatDate(k.lastUsedAt)}`,
  );
  console.log(`   Expires: ${formatDate(k.expiresAt)}`);
  console.log("");
}

async function listApiKeys() {
  const keys = await apiKeyTable.list();

  console.log("\n📋 API Keys:");
  console.log("━".repeat(80));

  if (keys.length === 0) {
    console.log("No API keys found.\n");
    return;
  }

  keys.forEach(printApiKeyRow);
}

async function revokeApiKey(keyId: string) {
  if (!keyId || !keyId.trim()) {
    throw new Error("Key id is required: revoke <id>");
  }

  const existing = await apiKeyTable.findById(keyId.trim());
  if (!existing) {
    console.log(`❌ API Key ${keyId} not found`);
    return;
  }

  await apiKeyTable.revoke(keyId.trim());
  console.log(`✅ API Key ${keyId} revoked`);
}

async function main() {
  const command = process.argv[2];
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];

  switch (command) {
    case "create":
      await createApiKey(arg1, arg2 ? Number.parseInt(arg2, 10) : 100);
      break;
    case "list":
      await listApiKeys();
      break;
    case "revoke":
      await revokeApiKey(arg1);
      break;
    default:
      printUsage();
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌ ${message}`);
  process.exitCode = 1;
});
