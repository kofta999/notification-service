#!/usr/bin/env bash
set -euo pipefail

REGION="us-east-1"

# Named resources used by your stack
TABLES=(
  "notification_db"
  "notification_api_keys"
  "notification_rate_limits"
)

QUEUES=(
  "notification_queue"
  "notification_queue_dlq"
)

LAMBDAS=(
  "notification_worker"
  "notification_api"
)

HTTP_API_NAME="notification-http-api"

echo "==> Region: ${REGION}"
echo "==> Starting cleanup..."

# 1) Delete Lambda event source mappings that reference notification_queue
echo "==> Cleaning Lambda event source mappings for notification_queue..."
QUEUE_ARN="$(aws sqs get-queue-url --queue-name notification_queue --region "${REGION}" --query 'QueueUrl' --output text 2>/dev/null | xargs -I{} aws sqs get-queue-attributes --queue-url {} --attribute-names QueueArn --region "${REGION}" --query 'Attributes.QueueArn' --output text 2>/dev/null || true)"

if [[ -n "${QUEUE_ARN}" ]]; then
  MAP_UUIDS="$(aws lambda list-event-source-mappings \
    --region "${REGION}" \
    --query "EventSourceMappings[?EventSourceArn=='${QUEUE_ARN}'].UUID" \
    --output text || true)"

  if [[ -n "${MAP_UUIDS}" ]]; then
    for UUID in ${MAP_UUIDS}; do
      echo "   - Deleting event source mapping: ${UUID}"
      aws lambda delete-event-source-mapping --uuid "${UUID}" --region "${REGION}" >/dev/null || true
    done
  fi
fi

# 2) Delete API Gateway HTTP API by name
echo "==> Deleting API Gateway HTTP API (${HTTP_API_NAME}) if it exists..."
API_IDS="$(aws apigatewayv2 get-apis --region "${REGION}" --query "Items[?Name=='${HTTP_API_NAME}'].ApiId" --output text || true)"
if [[ -n "${API_IDS}" ]]; then
  for API_ID in ${API_IDS}; do
    echo "   - Deleting HTTP API: ${API_ID}"
    aws apigatewayv2 delete-api --api-id "${API_ID}" --region "${REGION}" || true
  done
fi

# 3) Delete Lambda functions
echo "==> Deleting Lambda functions..."
for FN in "${LAMBDAS[@]}"; do
  if aws lambda get-function --function-name "${FN}" --region "${REGION}" >/dev/null 2>&1; then
    echo "   - Deleting Lambda: ${FN}"
    aws lambda delete-function --function-name "${FN}" --region "${REGION}" || true
  else
    echo "   - Lambda not found: ${FN}"
  fi
done

# 4) Delete SQS queues
echo "==> Deleting SQS queues..."
for Q in "${QUEUES[@]}"; do
  QURL="$(aws sqs get-queue-url --queue-name "${Q}" --region "${REGION}" --query 'QueueUrl' --output text 2>/dev/null || true)"
  if [[ -n "${QURL}" ]]; then
    echo "   - Deleting queue: ${Q} (${QURL})"
    aws sqs delete-queue --queue-url "${QURL}" --region "${REGION}" || true
  else
    echo "   - Queue not found: ${Q}"
  fi
done

# 5) Delete DynamoDB tables
echo "==> Deleting DynamoDB tables..."
for T in "${TABLES[@]}"; do
  if aws dynamodb describe-table --table-name "${T}" --region "${REGION}" >/dev/null 2>&1; then
    echo "   - Deleting table: ${T}"
    aws dynamodb delete-table --table-name "${T}" --region "${REGION}" >/dev/null || true
  else
    echo "   - Table not found: ${T}"
  fi
done

# 6) Wait for DynamoDB table deletion completion
echo "==> Waiting for table deletions..."
for T in "${TABLES[@]}"; do
  # waiter exits non-zero if table doesn't exist yet; ignore in that case
  aws dynamodb wait table-not-exists --table-name "${T}" --region "${REGION}" 2>/dev/null || true
done

echo "==> Cleanup done."
echo
echo "Next steps:"
echo "1) Build lambda artifacts:"
echo "   bun --filter api run build:lambda"
echo "   bun --filter worker run build"
echo "2) Deploy stack:"
echo "   bunx cdk deploy NotificationStack --require-approval never"