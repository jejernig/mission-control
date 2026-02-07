#!/bin/bash
set -euo pipefail

echo "🔧 Setup and Deploy Message Queue Architecture"
echo "==============================================="

# Check if running with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  This script needs sudo to add user to docker group."
    echo "    Run: sudo bash $0"
    exit 1
fi

# Get the actual user (not root)
ACTUAL_USER=${SUDO_USER:-$USER}
USER_HOME=$(eval echo ~$ACTUAL_USER)

echo "Setting up for user: $ACTUAL_USER"

# Step 1: Add user to docker group
echo ""
echo "Step 1: Adding $ACTUAL_USER to docker group..."
usermod -aG docker $ACTUAL_USER
echo "✅ Added to docker group"

# Step 2: Run deployment as the actual user
echo ""
echo "Step 2: Running deployment as $ACTUAL_USER..."
cd $USER_HOME/source/mission-control

# Start RabbitMQ
echo "  → Starting RabbitMQ..."
sudo -u $ACTUAL_USER docker compose up -d rabbitmq
sleep 3

# Set up systemd services (as user)
echo "  → Setting up systemd services..."
sudo -u $ACTUAL_USER systemctl --user daemon-reload
sudo -u $ACTUAL_USER systemctl --user enable mission-control-queue-listener
sudo -u $ACTUAL_USER systemctl --user start mission-control-queue-listener

# Enable and start timers
echo "  → Starting pipeline timers..."
sudo -u $ACTUAL_USER systemctl --user enable --now pipeline-planning.timer
sudo -u $ACTUAL_USER systemctl --user enable --now pipeline-assign.timer
sudo -u $ACTUAL_USER systemctl --user enable --now pipeline-review.timer
sudo -u $ACTUAL_USER systemctl --user enable --now pipeline-architect.timer

# Verify
echo ""
echo "========================================="
echo "✅ Deployment Complete!"
echo ""
echo "RabbitMQ Status:"
docker ps | grep mission-control-queue || echo "  ⚠️  Not running"

echo ""
echo "Queue Listener Status:"
sudo -u $ACTUAL_USER systemctl --user status mission-control-queue-listener --no-pager | head -5

echo ""
echo "Timer Status:"
sudo -u $ACTUAL_USER systemctl --user list-timers pipeline-* --no-pager

echo ""
echo "========================================="
echo "RabbitMQ Management UI: http://localhost:15672"
echo "  Username: mission-control"
echo "  Password: mFAxUw6adjNVUn1w/zPATzte1f2aGempx3CIXDmROlk="
echo ""
echo "⚠️  NOTE: You may need to log out and back in for"
echo "    docker group membership to fully activate."
echo "========================================="
