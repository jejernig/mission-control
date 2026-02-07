import { v4 as uuidv4 } from 'uuid';
import { queryOne, run, queryAll } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { executeOnTaskUpdated } from '@/lib/plugins';
import { getMissionControlUrl } from '@/lib/config';
import type { Task, UpdateTaskRequest, Agent } from '@/lib/types';
import {
  withErrorHandler,
  apiSuccess,
  checkEntityExists,
  extractParams,
  badRequest,
  forbidden
} from '@/lib/api-utils';

// GET /api/tasks/[id] - Get a single task
export const GET = withErrorHandler(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);
  const task = queryOne<Task>(
    `SELECT t.*,
      aa.name as assigned_agent_name,
      aa.avatar_emoji as assigned_agent_emoji
     FROM tasks t
     LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
     WHERE t.id = ?`,
    [id]
  );

  const error = checkEntityExists(task, 'Task');
  if (error) return error;

  return apiSuccess(task);
});

// PATCH /api/tasks/[id] - Update a task
export const PATCH = withErrorHandler(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);
  const body: UpdateTaskRequest & { updated_by_agent_id?: string } = await request.json();

  const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
  const error = checkEntityExists(existing, 'Task');
  if (error) return error;

  const updates: string[] = [];
  const values: unknown[] = [];
  const now = new Date().toISOString();

  // Workflow enforcement for agent-initiated approvals
  // If an agent is trying to move review→done, they must be a master agent
  // User-initiated moves (no agent ID) are allowed
  if (body.status === 'done' && existing!.status === 'review' && body.updated_by_agent_id) {
    const updatingAgent = queryOne<Agent>(
      'SELECT is_master FROM agents WHERE id = ?',
      [body.updated_by_agent_id]
    );

    if (!updatingAgent || !updatingAgent.is_master) {
      return forbidden('Only master agent (Charlie) can approve tasks');
    }
  }

  if (body.title !== undefined) {
    updates.push('title = ?');
    values.push(body.title);
  }
  if (body.description !== undefined) {
    updates.push('description = ?');
    values.push(body.description);
  }
  if (body.priority !== undefined) {
    updates.push('priority = ?');
    values.push(body.priority);
  }
  if (body.due_date !== undefined) {
    updates.push('due_date = ?');
    values.push(body.due_date);
  }
  if (body.workspace_id !== undefined) {
    updates.push('workspace_id = ?');
    values.push(body.workspace_id);
  }
  if (body.planning_complete !== undefined) {
    updates.push('planning_complete = ?');
    values.push(body.planning_complete);
    // Auto-move to inbox when planning is marked complete
    if (body.planning_complete === 1 && existing!.status === 'planning' && body.status === undefined) {
      updates.push('status = ?');
      values.push('inbox');
    }
  }

  // Track if we need to dispatch task
  let shouldDispatch = false;

  // Handle status change
  if (body.status !== undefined && body.status !== existing!.status) {
    updates.push('status = ?');
    values.push(body.status);

    // Auto-dispatch when moving to assigned
    if (body.status === 'assigned' && existing!.assigned_agent_id) {
      shouldDispatch = true;
    }

    // Auto-complete sessions when task moves to done or review
    if (body.status === 'done' || body.status === 'review') {
      const activeSessions = queryAll<{ id: string; openclaw_session_id: string }>(
        `SELECT id, openclaw_session_id FROM openclaw_sessions 
         WHERE task_id = ? AND status = 'active'`,
        [id]
      );
      
      if (activeSessions.length > 0) {
        run(
          `UPDATE openclaw_sessions 
           SET status = 'completed', ended_at = ?, updated_at = ?
           WHERE task_id = ? AND status = 'active'`,
          [now, now, id]
        );
        console.log(`[Task ${id}] Auto-completed ${activeSessions.length} session(s) on status change to ${body.status}`);
      }
    }

    // Log status change event
    const eventType = body.status === 'done' ? 'task_completed' : 'task_status_changed';
    run(
      `INSERT INTO events (id, type, task_id, message, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), eventType, id, `Task "${existing!.title}" moved to ${body.status}`, now]
    );

    // If this is a subtask completing, check if parent should auto-progress
    if (body.status === 'done' && existing!.parent_task_id) {
      const siblings = queryAll<{ status: string }>(
        'SELECT status FROM tasks WHERE parent_task_id = ?',
        [existing!.parent_task_id]
      );
      
      const allDone = siblings.every(s => s.status === 'done');
      
      if (allDone) {
        // Auto-progress parent to testing
        const parent = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [existing!.parent_task_id]);
        if (parent && parent.status === 'in_progress') {
          run(
            `UPDATE tasks SET status = 'testing', updated_at = ? WHERE id = ?`,
            [now, existing!.parent_task_id]
          );
          
          run(
            `INSERT INTO events (id, type, task_id, message, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), 'task_status_changed', existing!.parent_task_id, 
             `All subtasks done - "${parent.title}" moved to testing`, now]
          );
          
          // Broadcast parent update
          const updatedParent = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [existing!.parent_task_id]);
          if (updatedParent) {
            broadcast({ type: 'task_updated', payload: updatedParent });
          }
          
          console.log(`[Task ${existing!.parent_task_id}] All subtasks done - auto-moved to testing`);
        }
      }
    }
  }

  // Handle assignment change
  if (body.assigned_agent_id !== undefined && body.assigned_agent_id !== existing!.assigned_agent_id) {
    updates.push('assigned_agent_id = ?');
    values.push(body.assigned_agent_id);

    if (body.assigned_agent_id) {
      const agent = queryOne<Agent>('SELECT name FROM agents WHERE id = ?', [body.assigned_agent_id]);
      if (agent) {
        run(
          `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuidv4(), 'task_assigned', body.assigned_agent_id, id, `"${existing!.title}" assigned to ${agent.name}`, now]
        );

        // Auto-dispatch if already in assigned status or being assigned now
        if (existing!.status === 'assigned' || body.status === 'assigned') {
          shouldDispatch = true;
        }
      }
    }
  }

  if (updates.length === 0) {
    return badRequest('No updates provided');
  }

  updates.push('updated_at = ?');
  values.push(now);
  values.push(id);

  run(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, values);

  // Fetch updated task with all joined fields
  const task = queryOne<Task>(
    `SELECT t.*,
      aa.name as assigned_agent_name,
      aa.avatar_emoji as assigned_agent_emoji,
      ca.name as created_by_agent_name,
      ca.avatar_emoji as created_by_agent_emoji
     FROM tasks t
     LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
     LEFT JOIN agents ca ON t.created_by_agent_id = ca.id
     WHERE t.id = ?`,
    [id]
  );

  // Broadcast task update via SSE
  if (task) {
    broadcast({
      type: 'task_updated',
      payload: task,
    });
    
    // Execute plugin hooks
    await executeOnTaskUpdated(task);
  }

  // Trigger auto-dispatch if needed
  if (shouldDispatch) {
    // Call dispatch endpoint asynchronously (don't wait for response)
    const missionControlUrl = getMissionControlUrl();
    fetch(`${missionControlUrl}/api/tasks/${id}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).catch(err => {
      console.error('Auto-dispatch failed:', err);
    });
  }

  return apiSuccess(task);
});

// DELETE /api/tasks/[id] - Delete a task
export const DELETE = withErrorHandler(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);
  const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);

  const error = checkEntityExists(existing, 'Task');
  if (error) return error;

  // Delete or nullify related records first (foreign key constraints)
  // Note: task_activities and task_deliverables have ON DELETE CASCADE
  run('DELETE FROM openclaw_sessions WHERE task_id = ?', [id]);
  run('DELETE FROM events WHERE task_id = ?', [id]);
  // Conversations reference tasks - nullify or delete
  run('UPDATE conversations SET task_id = NULL WHERE task_id = ?', [id]);

  // Now delete the task (cascades to task_activities and task_deliverables)
  run('DELETE FROM tasks WHERE id = ?', [id]);

  // Broadcast deletion via SSE
  broadcast({
    type: 'task_deleted',
    payload: { id },
  });

  return apiSuccess({ success: true });
});
