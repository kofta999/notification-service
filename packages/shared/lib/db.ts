import {
  DynamoDBClient,
  type DynamoDBClientConfig,
} from "@aws-sdk/client-dynamodb";
import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  ScanCommand,
  DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

export type NotificationChannel = "email" | "sms" | "push";
export type NotificationStatus = "QUEUED" | "SENDING" | "SENT" | "FAILED";

export interface NotificationPayload {
  [key: string]: unknown;
}

export interface Notification {
  id: string;
  recipientId: string;
  channel: NotificationChannel;
  channelAddress: string;
  payload: NotificationPayload;
  status: NotificationStatus;
  retries: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyRecord {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  rateLimit: number;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export interface CreateNotificationInput {
  recipientId: string;
  channel: NotificationChannel;
  channelAddress: string;
  payload: NotificationPayload;
}

export interface CreateApiKeyInput {
  key: string;
  name: string;
  rateLimit?: number;
  expiresAt?: Date | null;
}

export interface DbOptions {
  region?: string;
  notificationTableName?: string;
  apiKeyTableName?: string;
  rateLimitTableName?: string;
  endpoint?: string;
}

/**
 * Internal single-table entity discriminator.
 * You can migrate this to separate tables later without changing consumers.
 */
type EntityType = "NOTIFICATION" | "API_KEY";

interface BaseEntity {
  entityType: EntityType;
  pk: string;
  sk: string;
  createdAt: string;
  updatedAt: string;
}

interface NotificationEntity extends BaseEntity {
  entityType: "NOTIFICATION";
  id: string;
  recipientId: string;
  channel: NotificationChannel;
  channelAddress: string;
  payload: NotificationPayload;
  status: NotificationStatus;
  retries: number;
}

interface ApiKeyEntity extends BaseEntity {
  entityType: "API_KEY";
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  rateLimit: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  gsi1pk: string; // APIKEY#<key>
  gsi1sk: string; // APIKEY#<key>
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseDateOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

function isNotificationChannel(value: unknown): value is NotificationChannel {
  return value === "email" || value === "sms" || value === "push";
}

function toNotificationModel(entity: NotificationEntity): Notification {
  return {
    id: entity.id,
    recipientId: entity.recipientId,
    channel: entity.channel,
    channelAddress: entity.channelAddress,
    payload: entity.payload ?? {},
    status: entity.status,
    retries: entity.retries ?? 0,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function toApiKeyModel(entity: ApiKeyEntity): ApiKeyRecord {
  return {
    id: entity.id,
    key: entity.key,
    name: entity.name,
    isActive: entity.isActive,
    rateLimit: entity.rateLimit,
    createdAt: entity.createdAt,
    expiresAt: entity.expiresAt,
    lastUsedAt: entity.lastUsedAt,
  };
}

export class NotificationTable {
  constructor(private readonly ddb: DynamoDBDocumentClient, private readonly tableName: string) {}

  async create(input: CreateNotificationInput): Promise<Notification> {
    const timestamp = nowIso();
    const id = randomUUID();

    const entity: NotificationEntity = {
      entityType: "NOTIFICATION",
      pk: `NOTIFICATION#${id}`,
      sk: `NOTIFICATION#${id}`,
      id,
      recipientId: input.recipientId,
      channel: input.channel,
      channelAddress: input.channelAddress,
      payload: input.payload ?? {},
      status: "QUEUED",
      retries: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.ddb.send(
      new PutCommand({
        TableName: this.tableName,
        Item: entity,
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );

    return toNotificationModel(entity);
  }

  async findById(id: string): Promise<Notification | null> {
    const result = await this.ddb.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          pk: `NOTIFICATION#${id}`,
          sk: `NOTIFICATION#${id}`,
        },
      }),
    );

    if (!result.Item) return null;
    const item = result.Item as Partial<NotificationEntity>;

    if (item.entityType !== "NOTIFICATION" || !isNotificationChannel(item.channel)) {
      return null;
    }

    return toNotificationModel(item as NotificationEntity);
  }

  async findStatus(id: string): Promise<Pick<Notification, "id" | "status" | "updatedAt"> | null> {
    const result = await this.ddb.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          pk: `NOTIFICATION#${id}`,
          sk: `NOTIFICATION#${id}`,
        },
        ProjectionExpression: "id, #status, updatedAt, entityType",
        ExpressionAttributeNames: {
          "#status": "status",
        },
      }),
    );

    if (!result.Item) return null;
    const item = result.Item as Partial<NotificationEntity>;
    if (item.entityType !== "NOTIFICATION" || !item.id || !item.status || !item.updatedAt) {
      return null;
    }

    return {
      id: item.id,
      status: item.status,
      updatedAt: item.updatedAt,
    };
  }

  /**
   * Atomically sets status to SENDING only if current status is QUEUED.
   * Returns the updated notification, or null if condition failed / missing.
   */
  async markSendingIfQueued(id: string): Promise<Notification | null> {
    try {
      const result = await this.ddb.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            pk: `NOTIFICATION#${id}`,
            sk: `NOTIFICATION#${id}`,
          },
          ConditionExpression: "attribute_exists(pk) AND #status = :queued",
          UpdateExpression: "SET #status = :sending, updatedAt = :updatedAt",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":queued": "QUEUED",
            ":sending": "SENDING",
            ":updatedAt": nowIso(),
          },
          ReturnValues: "ALL_NEW",
        }),
      );

      if (!result.Attributes) return null;
      return toNotificationModel(result.Attributes as NotificationEntity);
    } catch {
      return null;
    }
  }

  async markSent(id: string): Promise<void> {
    await this.setStatus(id, "SENT");
  }

  async markFailed(id: string): Promise<void> {
    await this.setStatus(id, "FAILED");
  }

  async incrementRetries(id: string): Promise<number> {
    const result = await this.ddb.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          pk: `NOTIFICATION#${id}`,
          sk: `NOTIFICATION#${id}`,
        },
        ConditionExpression: "attribute_exists(pk)",
        UpdateExpression: "SET retries = if_not_exists(retries, :zero) + :one, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":zero": 0,
          ":one": 1,
          ":updatedAt": nowIso(),
        },
        ReturnValues: "UPDATED_NEW",
      }),
    );

    return Number(result.Attributes?.retries ?? 0);
  }

  async find(params: { recipientId?: string; status?: NotificationStatus; limit?: number } = {}): Promise<Notification[]> {
    // Simple scan-based finder to keep API ergonomic.
    // For scale, move to dedicated GSIs and Query operations.
    const filters: string[] = ["entityType = :entityType"];
    const values: Record<string, unknown> = {
      ":entityType": "NOTIFICATION",
    };

    if (params.recipientId) {
      filters.push("recipientId = :recipientId");
      values[":recipientId"] = params.recipientId;
    }

    if (params.status) {
      filters.push("#status = :status");
      values[":status"] = params.status;
    }

    const result = await this.ddb.send(
      new ScanCommand({
        TableName: this.tableName,
        FilterExpression: filters.join(" AND "),
        ExpressionAttributeValues: values,
        ExpressionAttributeNames: params.status ? { "#status": "status" } : undefined,
        Limit: params.limit ?? 50,
      }),
    );

    const items = (result.Items ?? []) as NotificationEntity[];
    return items.map(toNotificationModel);
  }

  private async setStatus(id: string, status: NotificationStatus): Promise<void> {
    await this.ddb.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          pk: `NOTIFICATION#${id}`,
          sk: `NOTIFICATION#${id}`,
        },
        ConditionExpression: "attribute_exists(pk)",
        UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": status,
          ":updatedAt": nowIso(),
        },
      }),
    );
  }
}

export class ApiKeyTable {
  constructor(private readonly ddb: DynamoDBDocumentClient, private readonly tableName: string) {}

  async create(input: CreateApiKeyInput): Promise<ApiKeyRecord> {
    const timestamp = nowIso();
    const id = randomUUID();

    const entity: ApiKeyEntity = {
      entityType: "API_KEY",
      pk: `API_KEY#${id}`,
      sk: `API_KEY#${id}`,
      id,
      key: input.key,
      name: input.name,
      isActive: true,
      rateLimit: input.rateLimit ?? 100,
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: parseDateOrNull(input.expiresAt),
      lastUsedAt: null,
      gsi1pk: `APIKEY#${input.key}`,
      gsi1sk: `APIKEY#${input.key}`,
    };

    await this.ddb.send(
      new PutCommand({
        TableName: this.tableName,
        Item: entity,
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );

    return toApiKeyModel(entity);
  }

  async findById(id: string): Promise<ApiKeyRecord | null> {
    const result = await this.ddb.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          pk: `API_KEY#${id}`,
          sk: `API_KEY#${id}`,
        },
      }),
    );

    if (!result.Item) return null;
    const item = result.Item as Partial<ApiKeyEntity>;
    if (item.entityType !== "API_KEY") return null;
    return toApiKeyModel(item as ApiKeyEntity);
  }

  /**
   * Requires a GSI named `gsi1` with partition key `gsi1pk` and sort key `gsi1sk`.
   */
  async findByKey(key: string): Promise<ApiKeyRecord | null> {
    const result = await this.ddb.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :gsi1pk AND gsi1sk = :gsi1sk",
        ExpressionAttributeValues: {
          ":gsi1pk": `APIKEY#${key}`,
          ":gsi1sk": `APIKEY#${key}`,
        },
        Limit: 1,
      }),
    );

    const item = result.Items?.[0] as ApiKeyEntity | undefined;
    if (!item || item.entityType !== "API_KEY") return null;
    return toApiKeyModel(item);
  }

  async list(limit = 100): Promise<ApiKeyRecord[]> {
    const result = await this.ddb.send(
      new ScanCommand({
        TableName: this.tableName,
        FilterExpression: "entityType = :entityType",
        ExpressionAttributeValues: {
          ":entityType": "API_KEY",
        },
        Limit: limit,
      }),
    );

    const items = (result.Items ?? []) as ApiKeyEntity[];
    return items.map(toApiKeyModel);
  }

  async revoke(id: string): Promise<void> {
    await this.ddb.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          pk: `API_KEY#${id}`,
          sk: `API_KEY#${id}`,
        },
        ConditionExpression: "attribute_exists(pk)",
        UpdateExpression: "SET isActive = :inactive, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":inactive": false,
          ":updatedAt": nowIso(),
        },
      }),
    );
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.ddb.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          pk: `API_KEY#${id}`,
          sk: `API_KEY#${id}`,
        },
        ConditionExpression: "attribute_exists(pk)",
        UpdateExpression: "SET lastUsedAt = :lastUsedAt, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":lastUsedAt": nowIso(),
          ":updatedAt": nowIso(),
        },
      }),
    );
  }

  isUsable(key: ApiKeyRecord): boolean {
    if (!key.isActive) return false;
    if (!key.expiresAt) return true;
    return new Date(key.expiresAt).getTime() > Date.now();
  }
}

export class DynamoDb {
  public readonly client: DynamoDBDocumentClient;
  public readonly notificationTable: NotificationTable;
  public readonly apiKeyTable: ApiKeyTable;
  public readonly notificationTableName: string;
  public readonly apiKeyTableName: string;
  public readonly rateLimitTableName: string;

  constructor(options: DbOptions = {}) {
    this.notificationTableName =
      options.notificationTableName ??
      process.env.DYNAMODB_NOTIFICATION_TABLE_NAME ??
      "notification_db";

    this.apiKeyTableName =
      options.apiKeyTableName ??
      process.env.DYNAMODB_API_KEY_TABLE_NAME ??
      "notification_api_keys";

    this.rateLimitTableName =
      options.rateLimitTableName ??
      process.env.DYNAMODB_RATE_LIMIT_TABLE_NAME ??
      "notification_rate_limits";

    const config: DynamoDBClientConfig = {
      region: options.region ?? process.env.AWS_REGION ?? "us-east-1",
      endpoint: options.endpoint ?? process.env.DYNAMODB_ENDPOINT,
    };

    const raw = new DynamoDBClient(config);
    this.client = DynamoDBDocumentClient.from(raw, {
      marshallOptions: { removeUndefinedValues: true },
    });

    this.notificationTable = new NotificationTable(this.client, this.notificationTableName);
    this.apiKeyTable = new ApiKeyTable(this.client, this.apiKeyTableName);
  }

  async healthcheck(): Promise<boolean> {
    await this.client.send(
      new GetCommand({
        TableName: this.notificationTableName,
        Key: {
          pk: "__healthcheck__",
          sk: "__healthcheck__",
        },
      }),
    );
    return true;
  }
}

let singleton: DynamoDb | undefined;

export function createDb(options?: DbOptions): DynamoDb {
  if (process.env.NODE_ENV === "production") {
    return new DynamoDb(options);
  }

  if (!singleton) {
    singleton = new DynamoDb(options);
  }
  return singleton;
}

export const db = createDb();

export const notificationTable = db.notificationTable;
export const apiKeyTable = db.apiKeyTable;
