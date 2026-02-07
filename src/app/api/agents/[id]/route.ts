import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
import type { Agent, UpdateAgentRequest } from '@/lib/types';
import { 
  withErrorHandler, 
  apiSuccess, 
  checkEntityExists, 
  extractParams,
  buildUpdateClause,
  badRequest
} from '@/lib/api-utils';

// GET /api/agents/[id] - Get a single agent
export const GET = withErrorHandler<{ params: Promise<{ id: string }> }>(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);
  const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);

  const error = checkEntityExists(agent, 'Agent');
  if (error) return error;

  return apiSuccess(agent);
});

// PATCH /api/agents/[id] - Update an agent
export const PATCH = withErrorHandler<{ params: Promise<{ id: string }> }>(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);
  const body: UpdateAgentRequest = await request.json();

  const existing = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
  const error = checkEntityExists(existing, 'Agent');
  if (error) return error;

  // Build update clause from body (excluding special handling fields)
  const { status, is_master, ...simpleUpdates } = body;
  const { clause, values } = buildUpdateClause(simpleUpdates);

  // Handle special fields manually
  const additionalUpdates: string[] = [];
  const additionalValues: unknown[] = [];

  if (status !== undefined) {
    additionalUpdates.push('status = ?');
    additionalValues.push(status);

    // Log status change event
    const now = new Date().toISOString();
    run(
      `INSERT INTO events (id, type, agent_id, message, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), 'agent_status_changed', id, `${existing!.name} is now ${status}`, now]
    );
  }

  if (is_master !== undefined) {
    additionalUpdates.push('is_master = ?');
    additionalValues.push(is_master ? 1 : 0);
  }

  // Combine all updates
  const allUpdates = [
    ...(clause ? [clause] : []),
    ...additionalUpdates,
    'updated_at = ?'
  ];
  const allValues = [
    ...values,
    ...additionalValues,
    new Date().toISOString(),
    id
  ];

  if (allUpdates.length === 1) { // Only 'updated_at = ?'
    return badRequest('No updates provided');
  }

  run(`UPDATE agents SET ${allUpdates.join(', ')} WHERE id = ?`, allValues);

  const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
  return apiSuccess(agent);
});

// DELETE /api/agents/[id] - Delete an agent
export const DELETE = withErrorHandler<{ params: Promise<{ id: string }> }>(async (request, context) => {
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
