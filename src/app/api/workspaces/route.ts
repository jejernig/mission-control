import { getDb } from '@/lib/db';
import type { Workspace, WorkspaceStats, TaskStatus } from '@/lib/types';
import {
  withErrorHandler,
  apiSuccess,
  badRequest,
  getSearchParam
} from '@/lib/api-utils';

// Helper to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// GET /api/workspaces - List all workspaces with stats
export const GET = withErrorHandler(async (request) => {
  const includeStats = getSearchParam(request, 'stats') === 'true';
  const db = getDb();
  
  if (includeStats) {
    // Get workspaces with task counts and agent counts
    const workspaces = db.prepare('SELECT * FROM workspaces ORDER BY name').all() as Workspace[];
    
    const stats: WorkspaceStats[] = workspaces.map(workspace => {
      // Get task counts by status
      const taskCounts = db.prepare(`
        SELECT status, COUNT(*) as count 
        FROM tasks 
        WHERE workspace_id = ? 
        GROUP BY status
      `).all(workspace.id) as { status: TaskStatus; count: number }[];
      
      const counts: WorkspaceStats['taskCounts'] = {
        planning: 0,
        inbox: 0,
        assigned: 0,
        in_progress: 0,
        testing: 0,
        review: 0,
        done: 0,
        total: 0
      };
      
      taskCounts.forEach(tc => {
        counts[tc.status] = tc.count;
        counts.total += tc.count;
      });
      
      // Get agent count
      const agentCount = db.prepare(
        'SELECT COUNT(*) as count FROM agents WHERE workspace_id = ?'
      ).get(workspace.id) as { count: number };
      
      return {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        icon: workspace.icon,
        parent_id: (workspace as { parent_id?: string }).parent_id || null,
        taskCounts: counts,
        agentCount: agentCount.count
      };
    });
    
    return apiSuccess(stats);
  }
  
  // Order: parent workspaces first (parent_id IS NULL), then children alphabetically
  const workspaces = db.prepare(`
    SELECT * FROM workspaces 
    ORDER BY 
      CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END,
      name
  `).all();
  return apiSuccess(workspaces);
});

// POST /api/workspaces - Create a new workspace
export const POST = withErrorHandler(async (request) => {
  const body = await request.json();
  const { name, description, icon, parent_id } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return badRequest('Name is required');
  }

  const db = getDb();
  const id = crypto.randomUUID();
  const slug = generateSlug(name);
  
  // Check if slug already exists
  const existing = db.prepare('SELECT id FROM workspaces WHERE slug = ?').get(slug);
  if (existing) {
    return badRequest('A workspace with this name already exists');
  }

  db.prepare(`
    INSERT INTO workspaces (id, name, slug, description, icon, parent_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), slug, description || null, icon || '📁', parent_id || null);

  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  return apiSuccess(workspace, 201);
});
