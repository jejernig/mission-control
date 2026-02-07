import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { executeOnTaskCreated } from '@/lib/plugins';
import type { Task, CreateTaskRequest, Agent } from '@/lib/types';
import {
  withErrorHandler,
  apiSuccess,
  badRequest,
  parseSearchParams
} from '@/lib/api-utils';

// GET /api/tasks - List all tasks with optional filters
export const GET = withErrorHandler(async (request) => {
  const { status, business_id, workspace_id, assigned_agent_id } = parseSearchParams(request, [
    'status',
    'business_id',
    'workspace_id',
    'assigned_agent_id'
  ]);

  let sql = `
    SELECT
      t.*,
      aa.name as assigned_agent_name,
      aa.avatar_emoji as assigned_agent_emoji,
      ca.name as created_by_agent_name
    FROM tasks t
    LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
    LEFT JOIN agents ca ON t.created_by_agent_id = ca.id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (status) {
    // Support comma-separated status values (e.g., status=inbox,testing,in_progress)
    const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      sql += ' AND t.status = ?';
      params.push(statuses[0]);
    } else if (statuses.length > 1) {
      sql += ` AND t.status IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    }
  }
  if (business_id) {
    sql += ' AND t.business_id = ?';
    params.push(business_id);
  }
  if (workspace_id) {
    sql += ' AND t.workspace_id = ?';
    params.push(workspace_id);
  }
  if (assigned_agent_id) {
    sql += ' AND t.assigned_agent_id = ?';
    params.push(assigned_agent_id);
  }

  sql += ' ORDER BY t.created_at DESC';

  const tasks = queryAll<Task & { assigned_agent_name?: string; assigned_agent_emoji?: string; created_by_agent_name?: string }>(sql, params);

  // Transform to include nested agent info
  const transformedTasks = tasks.map((task) => ({
    ...task,
    assigned_agent: task.assigned_agent_id
      ? {
          id: task.assigned_agent_id,
          name: task.assigned_agent_name,
          avatar_emoji: task.assigned_agent_emoji,
        }
      : undefined,
  }));

  return apiSuccess(transformedTasks);
});

// POST /api/tasks - Create a new task
export const POST = withErrorHandler(async (request) => {
  const body: CreateTaskRequest = await request.json();
  console.log('[POST /api/tasks] Received body:', JSON.stringify(body));

  if (!body.title) {
    console.log('[POST /api/tasks] Title missing or empty');
    return badRequest('Title is required');
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  const workspaceId = (body as { workspace_id?: string }).workspace_id || 'default';
  const status = (body as { status?: string }).status || 'inbox';
  const parentTaskId = body.parent_task_id || null;
  
  run(
    `INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, created_by_agent_id, workspace_id, business_id, due_date, parent_task_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      body.title,
      body.description || null,
      status,
      body.priority || 'normal',
      body.assigned_agent_id || null,
      body.created_by_agent_id || null,
      workspaceId,
      body.business_id || 'default',
      body.due_date || null,
      parentTaskId,
      now,
      now,
    ]
  );

  // Log event
  let eventMessage = `New task: ${body.title}`;
  if (body.created_by_agent_id) {
    const creator = queryOne<Agent>('SELECT name FROM agents WHERE id = ?', [body.created_by_agent_id]);
    if (creator) {
      eventMessage = `${creator.name} created task: ${body.title}`;
    }
  }

  run(
    `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), 'task_created', body.created_by_agent_id || null, id, eventMessage, now]
  );

  // Fetch created task with all joined fields
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
  
  // Broadcast task creation via SSE
  if (task) {
    broadcast({
      type: 'task_created',
      payload: task,
    });
    
    // Execute plugin hooks
    await executeOnTaskCreated(task);
  }
  
  return apiSuccess(task, 201);
});
