#!/bin/bash
# Backfill Script: Register live OpenClaw sessions in Mission Control
#
# This script fetches live sessions and registers them with matching tasks

MISSION_CONTROL_URL="${MISSION_CONTROL_URL:-http://192.168.1.79:3001}"

echo "🔄 Backfill: Registering OpenClaw sessions in Mission Control"
echo ""

# Fetch sessions and tasks
echo "📡 Fetching live sessions from OpenClaw..."
SESSIONS=$(curl -s "$MISSION_CONTROL_URL/api/openclaw/sessions" | jq -c '.sessions.sessions // .sessions // []')
SESSION_COUNT=$(echo "$SESSIONS" | jq '[.[] | select(.key | contains(":subagent:"))] | length')
echo "   Found $SESSION_COUNT sub-agent sessions"
echo ""

echo "📋 Fetching tasks from Mission Control..."
TASKS=$(curl -s "$MISSION_CONTROL_URL/api/tasks")
TASK_COUNT=$(echo "$TASKS" | jq 'length')
echo "   Found $TASK_COUNT tasks"
echo ""

echo "🔗 Matching sessions to tasks..."
echo ""

REGISTERED=0
MATCHED=0
SKIPPED=0

# Process each subagent session
echo "$SESSIONS" | jq -c '.[] | select(.key | contains(":subagent:"))' | while read -r session; do
    KEY=$(echo "$session" | jq -r '.key')
    LABEL=$(echo "$session" | jq -r '.label // empty')
    TOKENS=$(echo "$session" | jq -r '.totalTokens')
    
    # Extract agent name from key
    AGENT_NAME=$(echo "$KEY" | cut -d: -f2)
    
    echo "Session: $KEY"
    echo "  Agent: $AGENT_NAME"
    echo "  Label: ${LABEL:-'(none)'}"
    echo "  Tokens: $TOKENS"
    
    if [ -z "$LABEL" ]; then
        echo "  ⏭️  Skipped: No label"
        echo ""
        continue
    fi
    
    # Extract GitHub issue from label (e.g., "athleet-gh2823-mfa" -> "2823")
    ISSUE_NUM=$(echo "$LABEL" | grep -oP 'gh\K\d+' | head -1)
    
    if [ -z "$ISSUE_NUM" ]; then
        echo "  ⏭️  Skipped: No GitHub issue in label"
        echo ""
        continue
    fi
    
    echo "  GitHub Issue: #$ISSUE_NUM"
    
    # Find matching task
    TASK=$(echo "$TASKS" | jq -c --arg num "$ISSUE_NUM" '.[] | select(.title | test("GH#" + $num + "[:\\\\s]"; "i"))' | head -1)
    
    if [ -z "$TASK" ]; then
        echo "  ⏭️  Skipped: No matching task"
        echo ""
        continue
    fi
    
    TASK_ID=$(echo "$TASK" | jq -r '.id')
    TASK_TITLE=$(echo "$TASK" | jq -r '.title')
    TASK_STATUS=$(echo "$TASK" | jq -r '.status')
    
    echo "  Task: $TASK_TITLE"
    echo "  Task ID: $TASK_ID"
    echo "  Status: $TASK_STATUS"
    
    # Register the session
    RESULT=$(curl -s -X POST "$MISSION_CONTROL_URL/api/tasks/$TASK_ID/subagent" \
        -H "Content-Type: application/json" \
        -d "{\"openclaw_session_id\": \"$KEY\", \"agent_name\": \"$AGENT_NAME\"}")
    
    if echo "$RESULT" | jq -e '.id' > /dev/null 2>&1; then
        echo "  ✅ Registered!"
    else
        ERROR=$(echo "$RESULT" | jq -r '.error // "Unknown error"')
        echo "  ❌ Failed: $ERROR"
    fi
    
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Done! Check Mission Control for registered sessions."
