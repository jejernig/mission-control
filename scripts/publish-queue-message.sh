#!/bin/bash
set -euo pipefail

# Usage: ./publish-queue-message.sh <queue> <message_type> [batch_size]
QUEUE=$1
MESSAGE_TYPE=$2
BATCH_SIZE=${3:-10}

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

MESSAGE=$(cat <<EOF
{
  "type": "$MESSAGE_TYPE",
  "timestamp": "$TIMESTAMP",
  "batchSize": $BATCH_SIZE
}
EOF
)

# Publish via RabbitMQ HTTP API
curl -s -u "mission-control:mFAxUw6adjNVUn1w/zPATzte1f2aGempx3CIXDmROlk=" \
  -H "Content-Type: application/json" \
  -X POST \
  "http://localhost:15672/api/exchanges/%2F/amq.default/publish" \
  -d "{
    \"properties\": {\"delivery_mode\": 2},
    \"routing_key\": \"$QUEUE\",
    \"payload\": $(echo "$MESSAGE" | jq -Rsa .),
    \"payload_encoding\": \"string\"
  }" > /dev/null

echo "[$(date)] Published $MESSAGE_TYPE to $QUEUE (batch=$BATCH_SIZE)"
