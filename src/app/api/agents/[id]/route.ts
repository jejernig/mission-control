import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
import type { Agent, UpdateAgentRequest } from '@/lib/types';
import {
  withErrorHandler,
  apiSuccess,
  apiError,
  checkEntityExists,
  extractParams,
  buildUpdateClause,
  ErrorStatus,
} from '@/lib/api-utils';

// GET /api/agents/[id] - Get a single agent
export const GET = withErrorHandler(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);
  const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);

  const error = checkEntityExists(agent, 'Agent');
  if (error) return error;

  return apiSuccess(agent);
});

// PATCH /api/agents/[id] - Update an agent
export const PATCH = withErrorHandler(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);
  const body: UpdateAgentRequest = await request.json();

  const existing = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
  const error = checkEntityExists(existing, 'Agent');
  if (error) return error;

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.role !== undefined) updates.role = body.role;
  if (body.description !== undefined) updates.description = body.description;
  if (body.avatar_emoji !== undefined) updates.avatar_emoji = body.avatar_emoji;
  if (body.status !== undefined) {
    updates.status = body.status;

    // Log status change event
    const now = new Date().toISOString();
    run(
      `INSERT INTO events (id, type, agent_id, message, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), 'agent_status_changed', id, `${existing.name} is now ${body.status}`, now]
    );
  }
  if (body.is_master !== undefined) updates.is_master = body.is_master ? 1 : 0;
  if (body.soul_md !== undefined) updates.soul_md = body.soul_md;
  if (body.user_md !== undefined) updates.user_md = body.user_md;
  if (body.agents_md !== undefined) updates.agents_md = body.agents_md;
  if (body.workspace_id !== undefined) updates.workspace_id = body.workspace_id;

  if (Object.keys(updates).length === 0) {
    return apiError('No updates provided', ErrorStatus.BAD_REQUEST);
  }

  updates.updated_at = new Date().toISOString();

  const { clause, values } = buildUpdateClause(updates);
  run(`UPDATE agents SET ${clause} WHERE id = ?`, [...values, id]);

  const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
  return apiSuccess(agent);
});

// DELETE /api/agents/[id] - Delete an agent
export const DELETE = withErrorHandler(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);
  const existing = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);

  const error = checkEntityExists(existing, 'Agent');
  if (error) return error;

  // Delete or nullify related records first (foreign key constraints)
  run('DELETE FROM openclaw_sessions WHERE agent_id = ?', [id]);
  run('DELETE FROM events WHERE agent_id = ?', [id]);
  run('DELETE FROM messages WHERE sender_agent_id = ?', [id]);
  run('DELETE FROM conversation_participants WHERE agent_id = ?', [id]);
  run('UPDATE tasks SET assigned_agent_id = NULL WHERE assigned_agent_id = ?', [id]);
  run('UPDATE tasks SET created_by_agent_id = NULL WHERE created_by_agent_id = ?', [id]);
  run('UPDATE task_activities SET agent_id = NULL WHERE agent_id = ?', [id]);

  // Now delete the agent
  run('DELETE FROM agents WHERE id = ?', [id]);

  return apiSuccess({ success: true });
});
