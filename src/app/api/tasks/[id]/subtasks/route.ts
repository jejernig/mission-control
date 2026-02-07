import { queryAll, queryOne } from '@/lib/db';
import type { Task } from '@/lib/types';
import {
  withErrorHandler,
  extractParams,
  checkEntityExists,
  apiSuccess,
} from '@/lib/api-utils';

// GET /api/tasks/[id]/subtasks - List all subtasks for a parent task
export const GET = withErrorHandler<{ params: Promise<{ id: string }> }>(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);

  // Check parent task exists
  const parent = queryOne<Task>('SELECT id FROM tasks WHERE id = ?', [id]);
  const parentError = checkEntityExists(parent, 'Parent task');
  if (parentError) return parentError;

  // Get all subtasks
  const subtasks = queryAll<Task>(
    `SELECT t.*,
      aa.name as assigned_agent_name,
      aa.avatar_emoji as assigned_agent_emoji
     FROM tasks t
     LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
     WHERE t.parent_task_id = ?
     ORDER BY t.created_at ASC`,
    [id]
  );

  // Summary stats
  const total = subtasks.length;
  const done = subtasks.filter(t => t.status === 'done').length;
  const inProgress = subtasks.filter(t => t.status === 'in_progress').length;
  const allDone = total > 0 && done === total;

  return apiSuccess({
    parent_id: id,
    subtasks,
    stats: {
      total,
      done,
      in_progress: inProgress,
      all_done: allDone
    }
  });
});
