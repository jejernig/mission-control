import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  withErrorHandler,
  apiSuccess,
  apiError,
  checkEntityExists,
  extractParams,
  buildUpdateClause,
  ErrorStatus,
} from '@/lib/api-utils';

// GET /api/workspaces/[id] - Get a single workspace
export const GET = withErrorHandler(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);
  const db = getDb();
  
  // Try to find by ID or slug
  const workspace = db.prepare(
    'SELECT * FROM workspaces WHERE id = ? OR slug = ?'
  ).get(id, id);
  
  const error = checkEntityExists(workspace, 'Workspace');
  if (error) return error;
  
  return apiSuccess(workspace);
});

// PATCH /api/workspaces/[id] - Update a workspace
export const PATCH = withErrorHandler(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);
  const body = await request.json();
  const { name, description, icon, github_repo, parent_id } = body;
  
  const db = getDb();
  
  // Check workspace exists
  const existing = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  const error = checkEntityExists(existing, 'Workspace');
  if (error) return error;
  
  // Build update object
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (icon !== undefined) updates.icon = icon;
  if (github_repo !== undefined) updates.github_repo = github_repo;
  if (parent_id !== undefined) updates.parent_id = parent_id;
  
  if (Object.keys(updates).length === 0) {
    return apiError('No fields to update', ErrorStatus.BAD_REQUEST);
  }
  
  const { clause, values } = buildUpdateClause(updates);
  
  // Note: SQLite doesn't support named params in the same way, so we manually add updated_at
  db.prepare(`
    UPDATE workspaces SET ${clause}, updated_at = datetime('now') WHERE id = ?
  `).run(...values, id);
  
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  return apiSuccess(workspace);
});

// DELETE /api/workspaces/[id] - Delete a workspace
export const DELETE = withErrorHandler(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);
  const db = getDb();
  
  // Don't allow deleting the default workspace
  if (id === 'default') {
    return apiError('Cannot delete the default workspace', ErrorStatus.BAD_REQUEST);
  }
  
  // Check workspace exists
  const existing = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  const error = checkEntityExists(existing, 'Workspace');
  if (error) return error;
  
  // Check if workspace has tasks or agents
  const taskCount = db.prepare(
    'SELECT COUNT(*) as count FROM tasks WHERE workspace_id = ?'
  ).get(id) as { count: number };
  
  const agentCount = db.prepare(
    'SELECT COUNT(*) as count FROM agents WHERE workspace_id = ?'
  ).get(id) as { count: number };
  
  if (taskCount.count > 0 || agentCount.count > 0) {
    return NextResponse.json({ 
      error: 'Cannot delete workspace with existing tasks or agents',
      taskCount: taskCount.count,
      agentCount: agentCount.count
    }, { status: ErrorStatus.BAD_REQUEST });
  }
  
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
  
  return apiSuccess({ success: true });
});
