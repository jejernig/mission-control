#!/bin/bash
# Backfill GitHub repo URLs for workspaces and convert commit deliverables to full URLs

MISSION_CONTROL_URL="${MISSION_CONTROL_URL:-http://192.168.1.79:3001}"

echo "🔄 Backfill: Adding GitHub repo URLs to workspaces"
echo ""

# Define workspace -> GitHub repo mappings
declare -A REPO_URLS=(
  ["athleet"]="https://github.com/Athleet-LLC/Athleet"
  ["civicmind"]="https://github.com/crshdn/CivicMind"
  ["vetlinked"]="https://github.com/crshdn/VetLinked"
  ["julesops"]="https://github.com/crshdn/JulesOps"
  ["default"]=""
)

# Update workspace github_repo fields
for workspace in "${!REPO_URLS[@]}"; do
    repo_url="${REPO_URLS[$workspace]}"
    if [ -n "$repo_url" ]; then
        echo "📁 Updating $workspace -> $repo_url"
        curl -s -X PATCH "$MISSION_CONTROL_URL/api/workspaces/$workspace" \
            -H "Content-Type: application/json" \
            -d "{\"github_repo\": \"$repo_url\"}" > /dev/null
    fi
done

echo ""
echo "🔄 Backfill: Converting commit deliverables to full URLs"
echo ""

# Get all deliverables with type 'commit' that don't have full URLs
TASKS=$(curl -s "$MISSION_CONTROL_URL/api/tasks")

echo "$TASKS" | jq -c '.[]' | while read -r task; do
    TASK_ID=$(echo "$task" | jq -r '.id')
    WORKSPACE_ID=$(echo "$task" | jq -r '.workspace_id')
    
    # Get repo URL for this workspace
    REPO_URL="${REPO_URLS[$WORKSPACE_ID]}"
    
    if [ -z "$REPO_URL" ]; then
        continue
    fi
    
    # Get deliverables for this task
    DELIVERABLES=$(curl -s "$MISSION_CONTROL_URL/api/tasks/$TASK_ID/deliverables")
    
    echo "$DELIVERABLES" | jq -c '.[] | select(.deliverable_type == "commit")' | while read -r deliv; do
        DELIV_ID=$(echo "$deliv" | jq -r '.id')
        DELIV_PATH=$(echo "$deliv" | jq -r '.path')
        DELIV_TITLE=$(echo "$deliv" | jq -r '.title')
        
        # Skip if already a full URL
        if [[ "$DELIV_PATH" == http* ]]; then
            continue
        fi
        
        # Convert short hash to full GitHub commit URL
        FULL_URL="$REPO_URL/commit/$DELIV_PATH"
        
        echo "📝 $DELIV_TITLE"
        echo "   $DELIV_PATH -> $FULL_URL"
        
        # Update the deliverable (need a PATCH endpoint or direct DB update)
        # For now, we'll create a new one and note the old
        curl -s -X POST "$MISSION_CONTROL_URL/api/tasks/$TASK_ID/deliverables" \
            -H "Content-Type: application/json" \
            -d "{\"deliverable_type\": \"url\", \"title\": \"$DELIV_TITLE\", \"path\": \"$FULL_URL\", \"description\": \"GitHub commit\"}" > /dev/null
        
        echo "   ✅ Added as URL deliverable"
    done
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Done!"
