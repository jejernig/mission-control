/**
 * Task Deliverables API
 * Endpoints for managing task deliverables (files, URLs, artifacts)
 */

import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { executeOnDeliverableAdded } from '@/lib/plugins';
import { existsSync } from 'fs';
import type { TaskDeliverable } from '@/lib/types';
import {
  withErrorHandler,
  extractParams,
  badRequest,
  apiSuccess,
} from '@/lib/api-utils';

interface Workspace {
  id: string;
  github_repo?: string;
}

/**
 * GET /api/tasks/[id]/deliverables
 * Retrieve all deliverables for a task
 * Transforms commit hashes to full GitHub URLs based on workspace config
 */
export const GET = withErrorHandler<{ params: Promise<{ id: string }> }>(async (request, context) => {
  const { id: taskId } = await extractParams<{ id: string }>(context);
  const db = getDb();

  // Get task to find workspace
  const task = db.prepare('SELECT workspace_id FROM tasks WHERE id = ?').get(taskId) as { workspace_id: string } | undefined;
  
  // Get workspace github_repo if available
  let githubRepo: string | null = null;
  if (task?.workspace_id) {
    const workspace = db.prepare('SELECT github_repo FROM workspaces WHERE id = ?').get(task.workspace_id) as Workspace | undefined;
    githubRepo = workspace?.github_repo || null;
  }

  const deliverables = db.prepare(`
    SELECT *
    FROM task_deliverables
    WHERE task_id = ?
    ORDER BY created_at DESC
  `).all(taskId) as TaskDeliverable[];

  // Transform commit paths to full GitHub URLs
  const transformed = deliverables.map(d => {
    if (d.deliverable_type === 'commit' && d.path && githubRepo && !d.path.startsWith('http')) {
      return {
        ...d,
        path: `${githubRepo}/commit/${d.path}`,
        _original_path: d.path, // Keep original for reference
      };
    }
    return d;
  });

  return apiSuccess(transformed);
});

/**
 * POST /api/tasks/[id]/deliverables
 * Add a new deliverable to a task
 */
export const POST = withErrorHandler<{ params: Promise<{ id: string }> }>(async (request, context) => {
  const { id: taskId } = await extractParams<{ id: string }>(context);
  const body = await request.json();
  
  const { deliverable_type, title, path, description } = body;

  if (!deliverable_type || !title) {
    return badRequest('deliverable_type and title are required');
  }

  // Validate file existence for file deliverables
  let fileExists = true;
  let normalizedPath = path;
  if (deliverable_type === 'file' && path) {
    // Expand tilde
    normalizedPath = path.replace(/^~/, process.env.HOME || '');
    fileExists = existsSync(normalizedPath);
    if (!fileExists) {
      console.warn(`[DELIVERABLE] Warning: File does not exist: ${normalizedPath}`);
    }
  }

  const db = getDb();
  const id = crypto.randomUUID();

  // Insert deliverable
  db.prepare(`
    INSERT INTO task_deliverables (id, task_id, deliverable_type, title, path, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    taskId,
    deliverable_type,
    title,
    path || null,
    description || null
  );

  // Get the created deliverable
  const deliverable = db.prepare(`
    SELECT *
    FROM task_deliverables
    WHERE id = ?
  `).get(id) as TaskDeliverable;

  // Broadcast to SSE clients
  broadcast({
    type: 'deliverable_added',
    payload: deliverable,
  });
  
  // Execute plugin hooks
  await executeOnDeliverableAdded(deliverable);

  // Return with warning if file doesn't exist
  if (deliverable_type === 'file' && !fileExists) {
    return apiSuccess({
      ...deliverable,
      warning: `File does not exist at path: ${normalizedPath}. Please create the file.`
    }, 201);
  }

  return apiSuccess(deliverable, 201);
});
