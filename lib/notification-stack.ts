import * as path from "path";
import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

export class NotificationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Queues
    const dlq = new sqs.Queue(this, "NotificationQueueDLQ", {
      queueName: "notification_queue_dlq",
      retentionPeriod: Duration.days(14),
    });

    const notificationQueue = new sqs.Queue(this, "NotificationQueue", {
      queueName: "notification_queue",
      visibilityTimeout: Duration.seconds(30),
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: parseInt(process.env.MAX_RETRIES ?? "5"),
      },
    });

    // 1) Notification table (status/source of truth)
    const notificationTable = new dynamodb.Table(this, "NotificationDbTable", {
      tableName: "notification_db",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      maxReadRequestUnits: 5,
      maxWriteRequestUnits: 5,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    // 2) API key table (auth)
    // Requires GSI for lookup by raw API key:
    //   gsi1pk = APIKEY#<key>
    //   gsi1sk = APIKEY#<key>
    const apiKeyTable = new dynamodb.Table(this, "NotificationApiKeyTable", {
      tableName: "notification_api_keys",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      maxReadRequestUnits: 5,
      maxWriteRequestUnits: 5,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    apiKeyTable.addGlobalSecondaryIndex({
      indexName: "gsi1",
      partitionKey: { name: "gsi1pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gsi1sk", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // 3) Rate limiter table (fixed-window counters)
    // TTL attribute: expiresAt (epoch seconds)
    const rateLimitTable = new dynamodb.Table(
      this,
      "NotificationRateLimitTable",
      {
        tableName: "notification_rate_limits",
        partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
        sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PROVISIONED,
        maxReadRequestUnits: 5,
        maxWriteRequestUnits: 5,
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
        timeToLiveAttribute: "expiresAt",
      },
    );

    // Worker Lambda
    const workerLambda = new lambda.Function(this, "NotificationWorkerLambda", {
      functionName: "notification_worker",
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset(path.resolve("packages/worker/dist")),
      handler: "index.handler",
      timeout: Duration.seconds(30),
      environment: {
        DYNAMODB_NOTIFICATION_TABLE_NAME: notificationTable.tableName,
        DYNAMODB_API_KEY_TABLE_NAME: apiKeyTable.tableName,
        DYNAMODB_RATE_LIMIT_TABLE_NAME: rateLimitTable.tableName,
        NOTIFICATION_QUEUE_URL: notificationQueue.queueUrl,
      },
    });

    // API Lambda (Hono app packaged in packages/api/dist)
    const apiLambda = new lambda.Function(this, "NotificationApiLambda", {
      functionName: "notification_api",
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset(path.resolve("packages/api/dist")),
      handler: "lambda.handler",
      timeout: Duration.seconds(30),
      memorySize: 512,
      environment: {
        API_APP_PORT: "3000",
        DYNAMODB_NOTIFICATION_TABLE_NAME: notificationTable.tableName,
        DYNAMODB_API_KEY_TABLE_NAME: apiKeyTable.tableName,
        DYNAMODB_RATE_LIMIT_TABLE_NAME: rateLimitTable.tableName,
        NOTIFICATION_QUEUE_URL: notificationQueue.queueUrl,
      },
    });

    // SQS Queue -> Worker Lambda
    const eventSource = new SqsEventSource(notificationQueue, {
      reportBatchItemFailures: true,
    });

    workerLambda.addEventSource(eventSource);

    // HTTP API Gateway -> API Lambda
    const httpApi = new apigwv2.HttpApi(this, "NotificationHttpApi", {
      apiName: "notification-http-api",
      createDefaultStage: true,
    });

    const apiIntegration = new integrations.HttpLambdaIntegration(
      "NotificationApiIntegration",
      apiLambda,
    );

    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
      integration: apiIntegration,
    });

    httpApi.addRoutes({
      path: "/",
      methods: [apigwv2.HttpMethod.ANY],
      integration: apiIntegration,
    });

    // Grants - worker
    notificationTable.grantReadWriteData(workerLambda);
    apiKeyTable.grantReadWriteData(workerLambda);
    rateLimitTable.grantReadWriteData(workerLambda);
    notificationQueue.grantConsumeMessages(workerLambda);
    notificationQueue.grantSendMessages(workerLambda);

    // Grants - API
    notificationTable.grantReadWriteData(apiLambda);
    apiKeyTable.grantReadWriteData(apiLambda);
    rateLimitTable.grantReadWriteData(apiLambda);
    notificationQueue.grantSendMessages(apiLambda);

    // CloudFormation Outputs - HTTP API
    new CfnOutput(this, "HttpApiId", {
      value: httpApi.httpApiId,
      description: "HTTP API ID",
      exportName: `${this.stackName}-HttpApiId`,
    });

    new CfnOutput(this, "HttpApiUrl", {
      value: httpApi.apiEndpoint,
      description: "HTTP API base URL",
      exportName: `${this.stackName}-HttpApiUrl`,
    });

    // CloudFormation Outputs - Lambdas
    new CfnOutput(this, "ApiLambdaName", {
      value: apiLambda.functionName,
      description: "API Lambda function name",
      exportName: `${this.stackName}-ApiLambdaName`,
    });

    new CfnOutput(this, "ApiLambdaArn", {
      value: apiLambda.functionArn,
      description: "API Lambda function ARN",
      exportName: `${this.stackName}-ApiLambdaArn`,
    });

    new CfnOutput(this, "WorkerLambdaName", {
      value: workerLambda.functionName,
      description: "Worker Lambda function name",
      exportName: `${this.stackName}-WorkerLambdaName`,
    });

    new CfnOutput(this, "WorkerLambdaArn", {
      value: workerLambda.functionArn,
      description: "Worker Lambda function ARN",
      exportName: `${this.stackName}-WorkerLambdaArn`,
    });

    // CloudFormation Outputs - SQS
    new CfnOutput(this, "NotificationQueueUrl", {
      value: notificationQueue.queueUrl,
      description: "Primary notification SQS queue URL",
      exportName: `${this.stackName}-NotificationQueueUrl`,
    });

    new CfnOutput(this, "NotificationQueueArn", {
      value: notificationQueue.queueArn,
      description: "Primary notification SQS queue ARN",
      exportName: `${this.stackName}-NotificationQueueArn`,
    });

    new CfnOutput(this, "NotificationQueueName", {
      value: notificationQueue.queueName,
      description: "Primary notification SQS queue name",
      exportName: `${this.stackName}-NotificationQueueName`,
    });

    new CfnOutput(this, "NotificationQueueDlqUrl", {
      value: dlq.queueUrl,
      description: "Notification DLQ URL",
      exportName: `${this.stackName}-NotificationQueueDlqUrl`,
    });

    new CfnOutput(this, "NotificationQueueDlqArn", {
      value: dlq.queueArn,
      description: "Notification DLQ ARN",
      exportName: `${this.stackName}-NotificationQueueDlqArn`,
    });

    new CfnOutput(this, "NotificationQueueDlqName", {
      value: dlq.queueName,
      description: "Notification DLQ name",
      exportName: `${this.stackName}-NotificationQueueDlqName`,
    });

    // CloudFormation Outputs - DynamoDB
    new CfnOutput(this, "NotificationTableName", {
      value: notificationTable.tableName,
      description: "Notifications DynamoDB table name",
      exportName: `${this.stackName}-NotificationTableName`,
    });

    new CfnOutput(this, "NotificationTableArn", {
      value: notificationTable.tableArn,
      description: "Notifications DynamoDB table ARN",
      exportName: `${this.stackName}-NotificationTableArn`,
    });

    new CfnOutput(this, "ApiKeyTableName", {
      value: apiKeyTable.tableName,
      description: "API keys DynamoDB table name",
      exportName: `${this.stackName}-ApiKeyTableName`,
    });

    new CfnOutput(this, "ApiKeyTableArn", {
      value: apiKeyTable.tableArn,
      description: "API keys DynamoDB table ARN",
      exportName: `${this.stackName}-ApiKeyTableArn`,
    });

    new CfnOutput(this, "RateLimitTableName", {
      value: rateLimitTable.tableName,
      description: "Rate limiter DynamoDB table name",
      exportName: `${this.stackName}-RateLimitTableName`,
    });

    new CfnOutput(this, "RateLimitTableArn", {
      value: rateLimitTable.tableArn,
      description: "Rate limiter DynamoDB table ARN",
      exportName: `${this.stackName}-RateLimitTableArn`,
    });

    new CfnOutput(this, "AwsRegion", {
      value: Stack.of(this).region,
      description: "AWS region used by this stack",
      exportName: `${this.stackName}-AwsRegion`,
    });
  }
}
