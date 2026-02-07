/**
 * GET /api/agents/capabilities
 * 
 * Retrieves all agent capabilities
 */

import { getDb } from '@/lib/db';
import type { AgentCapability } from '@/lib/types';
import { withErrorHandler, getSearchParam, apiSuccess } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request) => {
  const db = getDb();
  
  // Optional filters
  const agentId = getSearchParam(request, 'agent_id');
  const domain = getSearchParam(request, 'domain');
  const layer = getSearchParam(request, 'layer');

  let sql = `
    SELECT 
      c.*,
      a.name as agent_name,
      a.role as agent_role,
      a.avatar_emoji as agent_avatar_emoji
    FROM agent_capabilities c
    JOIN agents a ON a.id = c.agent_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (agentId) {
    sql += ' AND c.agent_id = ?';
    params.push(agentId);
  }

  if (domain) {
    sql += ' AND c.domain = ?';
    params.push(domain);
  }

  if (layer) {
    sql += ' AND c.layer = ?';
    params.push(layer);
  }

  sql += ' ORDER BY c.agent_id, c.domain, c.layer';

  const capabilities = db.prepare(sql).all(...params) as (AgentCapability & {
    agent_name: string;
    agent_role: string;
    agent_avatar_emoji: string;
  })[];

  // Group by domain and layer for summary
  const summary = {
    total: capabilities.length,
    by_domain: {} as Record<string, number>,
    by_layer: {} as Record<string, number>,
    by_agent: {} as Record<string, number>
  };

  for (const cap of capabilities) {
    summary.by_domain[cap.domain] = (summary.by_domain[cap.domain] || 0) + 1;
    summary.by_layer[cap.layer] = (summary.by_layer[cap.layer] || 0) + 1;
    summary.by_agent[cap.agent_id] = (summary.by_agent[cap.agent_id] || 0) + 1;
  }

  return apiSuccess({
    capabilities,
    summary
  });
});
