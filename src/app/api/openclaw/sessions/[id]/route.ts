import { getOpenClawClient } from '@/lib/openclaw/client';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { onSessionComplete } from '@/lib/openclaw/session-completion-hook';
import {
  withErrorHandler,
  extractParams,
  checkEntityExists,
  apiSuccess,
  apiError,
  badRequest,
  ErrorStatus,
} from '@/lib/api-utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/openclaw/sessions/[id] - Get session details
export const GET = withErrorHandler<RouteParams>(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);
  const client = getOpenClawClient();

  if (!client.isConnected()) {
    try {
      await client.connect();
    } catch {
      return apiError('Failed to connect to OpenClaw Gateway', ErrorStatus.SERVICE_UNAVAILABLE);
    }
  }

  // List sessions and find the one with matching ID
  const sessions = await client.listSessions();
  const session = sessions.find((s) => s.id === id);
  const sessionError = checkEntityExists(session, 'Session');
  if (sessionError) return sessionError;

  return apiSuccess({ session });
});

// POST /api/openclaw/sessions/[id] - Send a message to the session
export const POST = withErrorHandler<RouteParams>(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);
  const body = await request.json();
  const { content } = body;

  if (!content) {
    return badRequest('content is required');
  }

  const client = getOpenClawClient();

  if (!client.isConnected()) {
    try {
      await client.connect();
    } catch {
      return apiError('Failed to connect to OpenClaw Gateway', ErrorStatus.SERVICE_UNAVAILABLE);
    }
  }

  // Prefix message with [Mission Control] so Charlie knows the source
  const prefixedContent = `[Mission Control] ${content}`;
  await client.sendMessage(id, prefixedContent);

  return apiSuccess({ success: true });
});

// PATCH /api/openclaw/sessions/[id] - Update session status (for completing sub-agents)
export const PATCH = withErrorHandler<RouteParams>(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);
  const body = await request.json();
  const { status, ended_at } = body;

  const db = getDb();

  // Find session by openclaw_session_id
  const session = db.prepare('SELECT * FROM openclaw_sessions WHERE openclaw_session_id = ?').get(id) as any;
  const sessionError = checkEntityExists(session, 'Session');
  if (sessionError) return sessionError;

  // Update session
  const updates: string[] = [];
  const values: unknown[] = [];

  if (status !== undefined) {
    updates.push('status = ?');
    values.push(status);
  }

  if (ended_at !== undefined) {
    updates.push('ended_at = ?');
    values.push(ended_at);
  }

  if (updates.length === 0) {
    return badRequest('No updates provided');
  }

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(session.id);

  db.prepare(`UPDATE openclaw_sessions SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updatedSession = db.prepare('SELECT * FROM openclaw_sessions WHERE id = ?').get(session.id);

  // If status changed to completed, update the agent status too
  if (status === 'completed') {
    if (session.agent_id) {
      db.prepare('UPDATE agents SET status = ? WHERE id = ?').run('idle', session.agent_id);
    }
    if (session.task_id) {
      broadcast({
        type: 'agent_completed',
        payload: {
          taskId: session.task_id,
          sessionId: id,
        },
      });
    }
    
    // Session completion hook: auto-post activity if agent didn't report
    if (session.task_id && session.agent_id) {
      await onSessionComplete(db, {
        sessionId: session.id,
        openclawSessionId: id,
        taskId: session.task_id,
        agentId: session.agent_id,
        startedAt: session.started_at || session.created_at,
        endedAt: ended_at || new Date().toISOString(),
        status: status,
      });
    }
  }

  return apiSuccess(updatedSession);
});

// DELETE /api/openclaw/sessions/[id] - Delete a session and its associated agent
export const DELETE = withErrorHandler<RouteParams>(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);
  const db = getDb();

  // Find session by openclaw_session_id or internal id
  let session = db.prepare('SELECT * FROM openclaw_sessions WHERE openclaw_session_id = ?').get(id) as any;

  if (!session) {
    session = db.prepare('SELECT * FROM openclaw_sessions WHERE id = ?').get(id) as any;
  }

  const sessionError = checkEntityExists(session, 'Session');
  if (sessionError) return sessionError;

  const taskId = session.task_id;
  const agentId = session.agent_id;

  // Delete the session
  db.prepare('DELETE FROM openclaw_sessions WHERE id = ?').run(session.id);

  // If there's an associated agent that was auto-created (role = 'Sub-Agent'), delete it too
  if (agentId) {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
    if (agent && agent.role === 'Sub-Agent') {
      db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);
    } else if (agent) {
      // Update non-subagent back to idle
      db.prepare('UPDATE agents SET status = ? WHERE id = ?').run('idle', agentId);
    }
  }

  // Broadcast deletion event
  broadcast({
    type: 'agent_completed',
    payload: {
      taskId,
      sessionId: id,
      deleted: true,
    },
  });

  return apiSuccess({ success: true, deleted: session.id });
});
