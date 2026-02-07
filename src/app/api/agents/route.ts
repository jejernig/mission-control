import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run } from '@/lib/db';
import type { Agent, CreateAgentRequest } from '@/lib/types';
import {
  withErrorHandler,
  apiSuccess,
  apiError,
  getSearchParam,
  ErrorStatus,
} from '@/lib/api-utils';

// GET /api/agents - List all agents
export const GET = withErrorHandler(async (request) => {
  const workspaceId = getSearchParam(request, 'workspace_id');
  
  let agents: Agent[];
  if (workspaceId) {
    // Get the workspace to find its parent
    const workspace = queryOne<{ parent_id: string | null }>(
      'SELECT parent_id FROM workspaces WHERE id = ?', 
      [workspaceId]
    );
    
    // Include agents for this workspace, its parent workspace, and 'default' (legacy global)
    const parentId = workspace?.parent_id;
    
    if (parentId) {
      // Child workspace: include own agents + parent's agents + default + org-wide (NULL)
      agents = queryAll<Agent>(`
        SELECT * FROM agents 
        WHERE workspace_id = ? OR workspace_id = ? OR workspace_id = 'default' OR workspace_id IS NULL
        ORDER BY is_master DESC, name ASC
      `, [workspaceId, parentId]);
    } else {
      // Top-level workspace: include own agents + default + org-wide (NULL)
      agents = queryAll<Agent>(`
        SELECT * FROM agents 
        WHERE workspace_id = ? OR workspace_id = 'default' OR workspace_id IS NULL
        ORDER BY is_master DESC, name ASC
      `, [workspaceId]);
    }
  } else {
    agents = queryAll<Agent>(`
      SELECT * FROM agents ORDER BY is_master DESC, name ASC
    `);
  }
  return apiSuccess(agents);
});

// POST /api/agents - Create a new agent
export const POST = withErrorHandler(async (request) => {
  const body: CreateAgentRequest = await request.json();

  if (!body.name || !body.role) {
    return apiError('Name and role are required', ErrorStatus.BAD_REQUEST);
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  run(
    `INSERT INTO agents (id, name, role, description, avatar_emoji, is_master, workspace_id, soul_md, user_md, agents_md, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      body.name,
      body.role,
      body.description || null,
      body.avatar_emoji || '🤖',
      body.is_master ? 1 : 0,
      (body as { workspace_id?: string }).workspace_id || 'default',
      body.soul_md || null,
      body.user_md || null,
      body.agents_md || null,
      now,
      now,
    ]
  );

  // Log event
  run(
    `INSERT INTO events (id, type, agent_id, message, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), 'agent_joined', id, `${body.name} joined the team`, now]
  );

  const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
  return apiSuccess(agent, 201);
});
