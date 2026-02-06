#!/bin/bash
# Backfill activities for done tasks that have no activity records

MISSION_CONTROL_URL="${MISSION_CONTROL_URL:-http://192.168.1.79:3001}"

echo "🔄 Backfill: Adding completion activities for done tasks"
echo ""

# Get all done tasks
DONE_TASKS=$(curl -s "$MISSION_CONTROL_URL/api/tasks" | jq -c '.[] | select(.status == "done")')

echo "$DONE_TASKS" | while read -r task; do
    TASK_ID=$(echo "$task" | jq -r '.id')
    TASK_TITLE=$(echo "$task" | jq -r '.title')
    AGENT_NAME=$(echo "$task" | jq -r '.assigned_agent_name // "System"')
    UPDATED_AT=$(echo "$task" | jq -r '.updated_at')
    
    # Check if task already has activities
    ACTIVITY_COUNT=$(curl -s "$MISSION_CONTROL_URL/api/tasks/$TASK_ID/activities" | jq 'length')
    
    if [ "$ACTIVITY_COUNT" -gt 0 ]; then
        echo "⏭️  $TASK_TITLE - already has $ACTIVITY_COUNT activities"
        continue
    fi
    
    echo "📝 $TASK_TITLE"
    
    # Add a completion activity
    curl -s -X POST "$MISSION_CONTROL_URL/api/tasks/$TASK_ID/activities" \
        -H "Content-Type: application/json" \
        -d "{\"activity_type\": \"completed\", \"message\": \"Task completed by $AGENT_NAME\"}" > /dev/null
    
    echo "   ✅ Added completion activity"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Done!"
