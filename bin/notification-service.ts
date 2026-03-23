#!/usr/bin/env node
import "source-map-support/register.js";
import * as dotenv from "dotenv";
import * as cdk from "aws-cdk-lib";
import { NotificationStack } from "../lib/notification-stack.ts";

dotenv.config({ path: "./config/.env" });

const app = new cdk.App();

new NotificationStack(app, "NotificationStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "us-east-1",
  },
});
