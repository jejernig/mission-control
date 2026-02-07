#!/bin/bash
# Request Jarvis to spawn architects for tasks needing planning
# Called by systemd timer

BATCH_SIZE="${1:-5}"

# Send message to Jarvis to spawn architects
openclaw sessions send --label main --message "🏗️ SPAWN ARCHITECTS: Check for up to ${BATCH_SIZE} tasks in planning status that need architects. For each task:

1. Verify it has planning_complete=0 and no planning_session_key
2. Use sessions_spawn to create an isolated architect session
3. Each architect should autonomously create a planning spec and update the task

Use the Mission Control API at http://192.168.1.79:3001 to:
- GET /api/tasks?status=planning to find tasks
- Check for 🏗️ ARCHITECT_SPAWNED marker in activities to avoid duplicates

Spawn up to ${BATCH_SIZE} architects, then report back how many you spawned."
