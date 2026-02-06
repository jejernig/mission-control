#!/usr/bin/env npx ts-node
/**
 * Backfill Script: Register live OpenClaw sessions in Mission Control
 * 
 * This script:
 * 1. Fetches all live sub-agent sessions from OpenClaw Gateway
 * 2. Fetches all tasks from Mission Control
 * 3. Matches sessions to tasks by GitHub issue number in labels
 * 4. Registers unregistered sessions in Mission Control's database
 */

const MISSION_CONTROL_URL = process.env.MISSION_CONTROL_URL || 'http://192.168.1.79:3001';

interface OpenClawSession {
  key: string;
  sessionId: string;
  label?: string;
  displayName?: string;
  channel?: string;
  updatedAt: number;
  totalTokens: number;
  model?: string;
  abortedLastRun?: boolean;
}

interface Task {
  id: string;
  title: string;
  status: string;
  workspace_id?: string;
}

async function fetchLiveSessions(): Promise<OpenClawSession[]> {
  const res = await fetch(`${MISSION_CONTROL_URL}/api/openclaw/sessions`);
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
  const data = await res.json();
  const sessions = data.sessions?.sessions || data.sessions || [];
  // Filter to subagent sessions only
  return sessions.filter((s: OpenClawSession) => s.key?.includes(':subagent:'));
}

async function fetchTasks(): Promise<Task[]> {
  const res = await fetch(`${MISSION_CONTROL_URL}/api/tasks`);
  if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`);
  return res.json();
}

async function registerSession(taskId: string, sessionKey: string, agentName: string): Promise<boolean> {
  try {
    const res = await fetch(`${MISSION_CONTROL_URL}/api/tasks/${taskId}/subagent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        openclaw_session_id: sessionKey,
        agent_name: agentName,
      }),
    });
    
    if (res.ok) {
      console.log(`  ✅ Registered session for task ${taskId}`);
      return true;
    } else {
      const error = await res.json().catch(() => ({}));
      console.log(`  ❌ Failed: ${error.error || res.status}`);
      return false;
    }
  } catch (e) {
    console.log(`  ❌ Error: ${e}`);
    return false;
  }
}

function extractGitHubIssue(label: string): string | null {
  // Extract GitHub issue number from labels like:
  // - "athleet-gh2823-mfa-enforcement" -> "2823"
  // - "civicmind-gh252-security" -> "252"
  const match = label.match(/gh(\d+)/i);
  return match ? match[1] : null;
}

function extractAgentName(sessionKey: string): string {
  // Extract agent name from key like "agent:backend-engineer:subagent:xxx"
  const parts = sessionKey.split(':');
  return parts[1] || 'Unknown Agent';
}

function findTaskByGitHubIssue(tasks: Task[], issueNum: string, workspace?: string): Task | null {
  // Match task titles like "GH#2823: [HIGH] Email recovery..."
  const pattern = new RegExp(`GH#${issueNum}[:\\s]`, 'i');
  
  const matches = tasks.filter(t => pattern.test(t.title));
  
  // If workspace hint provided, prefer that
  if (workspace && matches.length > 1) {
    const wsMatch = matches.find(t => 
      t.workspace_id?.toLowerCase().includes(workspace.toLowerCase())
    );
    if (wsMatch) return wsMatch;
  }
  
  return matches[0] || null;
}

async function main() {
  console.log('🔄 Backfill: Registering OpenClaw sessions in Mission Control\n');
  
  // Fetch data
  console.log('📡 Fetching live sessions from OpenClaw...');
  const sessions = await fetchLiveSessions();
  console.log(`   Found ${sessions.length} sub-agent sessions\n`);
  
  console.log('📋 Fetching tasks from Mission Control...');
  const tasks = await fetchTasks();
  console.log(`   Found ${tasks.length} tasks\n`);
  
  // Process each session
  let registered = 0;
  let matched = 0;
  let skipped = 0;
  
  console.log('🔗 Matching sessions to tasks...\n');
  
  for (const session of sessions) {
    const agentName = extractAgentName(session.key);
    console.log(`Session: ${session.key}`);
    console.log(`  Agent: ${agentName}`);
    console.log(`  Label: ${session.label || '(none)'}`);
    console.log(`  Tokens: ${session.totalTokens.toLocaleString()}`);
    
    if (!session.label) {
      console.log(`  ⏭️  Skipped: No label to match\n`);
      skipped++;
      continue;
    }
    
    // Extract GitHub issue from label
    const issueNum = extractGitHubIssue(session.label);
    if (!issueNum) {
      console.log(`  ⏭️  Skipped: No GitHub issue in label\n`);
      skipped++;
      continue;
    }
    
    console.log(`  GitHub Issue: #${issueNum}`);
    
    // Extract workspace hint from label (e.g., "athleet", "civicmind")
    const workspaceHint = session.label.split('-')[0];
    
    // Find matching task
    const task = findTaskByGitHubIssue(tasks, issueNum, workspaceHint);
    if (!task) {
      console.log(`  ⏭️  Skipped: No matching task found\n`);
      skipped++;
      continue;
    }
    
    console.log(`  Task: ${task.title}`);
    console.log(`  Task ID: ${task.id}`);
    console.log(`  Status: ${task.status}`);
    matched++;
    
    // Register the session
    const success = await registerSession(task.id, session.key, agentName);
    if (success) registered++;
    
    console.log('');
  }
  
  // Summary
  console.log('━'.repeat(50));
  console.log('📊 Summary:');
  console.log(`   Total sessions: ${sessions.length}`);
  console.log(`   Matched to tasks: ${matched}`);
  console.log(`   Registered: ${registered}`);
  console.log(`   Skipped (no label/match): ${skipped}`);
  console.log('');
}

main().catch(console.error);
