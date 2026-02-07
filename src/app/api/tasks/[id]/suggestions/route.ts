/**
 * GET /api/tasks/:id/suggestions
 * 
 * Retrieves saved agent assignment suggestions for a task
 */

import { queryOne } from '@/lib/db';
import { agentMatcher } from '@/lib/services/agent-matcher';
import type { Task } from '@/lib/types';
import {
  withErrorHandler,
  extractParams,
  checkEntityExists,
  apiSuccess,
} from '@/lib/api-utils';

export const GET = withErrorHandler<{ params: Promise<{ id: string }> }>(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);

  // Verify task exists
  const task = queryOne<Task>('SELECT id FROM tasks WHERE id = ?', [id]);
  const taskError = checkEntityExists(task, 'Task');
  if (taskError) return taskError;

  // Get saved suggestions
  const suggestions = await agentMatcher.getSuggestions(id);

  return apiSuccess({
    task_id: id,
    suggestions,
    count: suggestions.length
  });
});
