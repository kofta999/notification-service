import { describe, it, expect, beforeAll } from "bun:test";
import app from "./app";
import { apiKeyTable } from "shared/db";

describe("API Endpoints", () => {
  let testApiKey: string;

  beforeAll(async () => {
    const key = await apiKeyTable.create({
      key: "test_key_12345",
      name: "Test Key",
      rateLimit: 100,
    });
    testApiKey = key.key;
  });

  it("should reject requests without API key", async () => {
    const res = await app.request("/notify", {
      method: "POST",
      body: JSON.stringify({
        recipientId: "user123",
        channel: "email",
        channelAddress: "test@example.com",
        payload: { message: "test" },
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    // @ts-ignore
    expect(body?.error).toBe("API key required");
  });

  it("should accept requests with valid API key", async () => {
    const res = await app.request("/notify", {
      method: "POST",
      body: JSON.stringify({
        recipientId: "user123",
        channel: "email",
        channelAddress: "test@example.com",
        payload: { message: "test" },
      }),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": testApiKey,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    // @ts-ignore
    expect(body.id).toBeDefined();
  });

  it("should return 404 for non-existent notification", async () => {
    const res = await app.request("/status/non-existent-id", {
      headers: {
        "x-api-key": testApiKey,
      },
    });

    expect(res.status).toBe(404);
  });
});
