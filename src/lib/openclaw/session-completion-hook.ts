/**
 * Session Completion Hook
 * Automatically posts activity log when spawned sessions complete without manual report
 * 
 * Spec: INFRASTRUCTURE_SESSION_COMPLETION.md
 * Date: 2026-02-06
 */

import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { broadcast } from '@/lib/events';

interface SessionCompletionContext {
  sessionId: string;
  openclawSessionId: string;
  taskId: string;
  agentId: string;
  startedAt: string;
  endedAt: string;
  status: string;
}

/**
 * Hook that runs when a spawned session completes
 * Checks if agent reported manually, auto-posts if not
 */
export async function onSessionComplete(
  db: Database.Database,
  context: SessionCompletionContext
): Promise<void> {
  // Only proceed if session was associated with a task
  if (!context.taskId || !context.agentId) {
    console.log('[Session Hook] No task/agent association, skipping auto-report');
    return;
  }

  try {
    // Check if agent already posted completion/status within last 2 minutes
    const recentActivity = db
      .prepare(`
        SELECT * FROM task_activities 
        WHERE task_id = ? 
          AND agent_id = ?
          AND activity_type IN ('comment', 'updated')
          AND datetime(created_at) > datetime('now', '-2 minutes')
        ORDER BY created_at DESC 
        LIMIT 1
      `)
      .get(context.taskId, context.agentId) as any;

    if (recentActivity) {
      // Agent already reported recently, skip auto-notification
      console.log(
        `[Session Hook] Agent ${context.agentId} already reported for task ${context.taskId}, skipping auto-report`
      );
      return;
    }

    // Query deliverables logged during session
    const sessionDeliverables = db
      .prepare(`
        SELECT * FROM task_deliverables
        WHERE task_id = ?
          AND datetime(created_at) >= datetime(?)
          AND datetime(created_at) <= datetime(?)
      `)
      .all(
        context.taskId,
        context.startedAt,
        context.endedAt
      ) as any[];

    // Build auto-notification message
    const statusEmoji =
      context.status === 'completed'
        ? '✅'
        : context.status === 'timeout'
        ? '⏱️'
        : '❌';

    const deliverablesList =
      sessionDeliverables.length > 0
        ? `\n\n**Deliverables logged (${sessionDeliverables.length}):**\n` +
          sessionDeliverables
            .map((d) => `• ${d.title} (${d.deliverable_type})`)
            .join('\n')
        : '\n\nNo deliverables logged during session.';

    const message =
      `@jarvis\n\n` +
      `**Session auto-report ${statusEmoji}**\n\n` +
      `Agent session completed without manual report.\n` +
      `Session: \`${context.openclawSessionId}\`\n` +
      `Status: ${context.status}` +
      deliverablesList +
      `\n\n*Please review deliverables tab for work completed.*`;

    // Create activity log entry
    const activityId = randomUUID();
    db.prepare(`
      INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      activityId,
      context.taskId,
      context.agentId,
      'comment',
      message,
      JSON.stringify({
        auto_generated: true,
        session_id: context.sessionId,
        openclaw_session_id: context.openclawSessionId,
        status: context.status,
        deliverables_count: sessionDeliverables.length,
      })
    );

    console.log(
      `[Session Hook] Auto-posted completion for agent ${context.agentId} on task ${context.taskId}`
    );

    // Broadcast via SSE for real-time UI updates
    broadcast({
      type: 'activity_logged',
      payload: {
        taskId: context.taskId,
        sessionId: context.openclawSessionId,
      },
    });
  } catch (error) {
    console.error('[Session Hook] Failed to auto-post completion:', error);
    // Don't throw - session completion should succeed even if hook fails
  }
}
