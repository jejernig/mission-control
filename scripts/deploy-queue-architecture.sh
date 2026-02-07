#!/bin/bash
set -euo pipefail

echo "🚀 Deploying Message Queue Architecture"
echo "========================================"

# Step 1: Start RabbitMQ
echo ""
echo "Step 1: Starting RabbitMQ container..."
cd ~/source/mission-control
docker compose up -d rabbitmq
sleep 5

# Step 2: Verify RabbitMQ is running
echo ""
echo "Step 2: Verifying RabbitMQ..."
docker ps | grep mission-control-queue || {
  echo "❌ RabbitMQ container not running"
  exit 1
}
echo "✅ RabbitMQ is running"

# Step 3: Enable and start the queue listener service
echo ""
echo "Step 3: Setting up queue listener service..."
systemctl --user daemon-reload
systemctl --user enable mission-control-queue-listener
systemctl --user start mission-control-queue-listener
systemctl --user status mission-control-queue-listener --no-pager || true

# Step 4: Enable and start systemd timers
echo ""
echo "Step 4: Setting up systemd timers..."
systemctl --user daemon-reload

# Enable all pipeline timers
systemctl --user enable pipeline-planning.timer
systemctl --user enable pipeline-assign.timer
systemctl --user enable pipeline-review.timer
systemctl --user enable pipeline-architect.timer

# Start all timers
systemctl --user start pipeline-planning.timer
systemctl --user start pipeline-assign.timer
systemctl --user start pipeline-review.timer
systemctl --user start pipeline-architect.timer

# Step 5: Verify timers are running
echo ""
echo "Step 5: Verifying timers..."
systemctl --user list-timers pipeline-* --no-pager

# Step 6: Access RabbitMQ Management UI
echo ""
echo "========================================"
echo "✅ Deployment Complete!"
echo ""
echo "RabbitMQ Management UI: http://localhost:15672"
echo "  Username: mission-control"
echo "  Password: mFAxUw6adjNVUn1w/zPATzte1f2aGempx3CIXDmROlk="
echo ""
echo "Queue Listener Status:"
echo "  systemctl --user status mission-control-queue-listener"
echo ""
echo "View Logs:"
echo "  journalctl --user -u mission-control-queue-listener -f"
echo "  journalctl --user -u pipeline-planning.service -f"
echo ""
echo "Timer Status:"
echo "  systemctl --user list-timers pipeline-*"
echo "========================================"
