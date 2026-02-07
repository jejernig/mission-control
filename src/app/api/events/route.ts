import { v4 as uuidv4 } from 'uuid';
import { queryAll, run } from '@/lib/db';
import type { Event } from '@/lib/types';
import { 
  withErrorHandler, 
  apiSuccess, 
  badRequest,
  getSearchParam 
} from '@/lib/api-utils';

// GET /api/events - List events (live feed)
export const GET = withErrorHandler(async (request) => {
  const limit = parseInt(getSearchParam(request, 'limit') || '50', 10);
  const since = getSearchParam(request, 'since'); // ISO timestamp for polling

  let sql = `
    SELECT e.*, a.name as agent_name, a.avatar_emoji as agent_emoji, t.title as task_title
    FROM events e
    LEFT JOIN agents a ON e.agent_id = a.id
    LEFT JOIN tasks t ON e.task_id = t.id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (since) {
    sql += ' AND e.created_at > ?';
    params.push(since);
  }

  sql += ' ORDER BY e.created_at DESC LIMIT ?';
  params.push(limit);

  const events = queryAll<Event & { agent_name?: string; agent_emoji?: string; task_title?: string }>(sql, params);

  // Transform to include nested info
  const transformedEvents = events.map((event) => ({
    ...event,
    agent: event.agent_id
      ? {
          id: event.agent_id,
          name: event.agent_name,
          avatar_emoji: event.agent_emoji,
        }
      : undefined,
    task: event.task_id
      ? {
          id: event.task_id,
          title: event.task_title,
        }
      : undefined,
  }));

  return apiSuccess(transformedEvents);
});

// POST /api/events - Create a manual event
export const POST = withErrorHandler(async (request) => {
  const body = await request.json();

  if (!body.type || !body.message) {
    return badRequest('Type and message are required');
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  run(
    `INSERT INTO events (id, type, agent_id, task_id, message, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      body.type,
      body.agent_id || null,
      body.task_id || null,
      body.message,
      body.metadata ? JSON.stringify(body.metadata) : null,
      now,
    ]
  );

  return apiSuccess({ id, type: body.type, message: body.message, created_at: now }, 201);
});
