/**
 * POST /api/agents/:id/capabilities
 * 
 * Adds or updates capabilities for a specific agent
 */

import { v4 as uuidv4 } from 'uuid';
import { getDb, queryOne } from '@/lib/db';
import type { Agent, CreateCapabilityRequest } from '@/lib/types';
import {
  withErrorHandler,
  extractParams,
  checkEntityExists,
  apiSuccess,
  badRequest,
} from '@/lib/api-utils';

export const POST = withErrorHandler<{ params: Promise<{ id: string }> }>(async (request, context) => {
  const { id: agentId } = await extractParams<{ id: string }>(context);
  const body: CreateCapabilityRequest = await request.json();

  // Verify agent exists
  const agent = queryOne<Agent>('SELECT id FROM agents WHERE id = ?', [agentId]);
  const agentError = checkEntityExists(agent, 'Agent');
  if (agentError) return agentError;

  // Validate required fields
  if (!body.domain || !body.layer || !body.skills) {
    return badRequest('domain, layer, and skills are required');
  }

  // Validate confidence range
  const confidence = body.confidence ?? 0.5;
  if (confidence < 0 || confidence > 1) {
    return badRequest('confidence must be between 0 and 1');
  }

  const db = getDb();
  const capabilityId = uuidv4();
  const skillsJson = JSON.stringify(Array.isArray(body.skills) ? body.skills : [body.skills]);

  // Check if capability already exists (same agent, domain, layer)
  const existing = queryOne(
    'SELECT id FROM agent_capabilities WHERE agent_id = ? AND domain = ? AND layer = ?',
    [agentId, body.domain, body.layer]
  );

  if (existing) {
    // Update existing capability
    db.prepare(`
      UPDATE agent_capabilities
      SET skills = ?, confidence = ?, updated_at = datetime('now')
      WHERE agent_id = ? AND domain = ? AND layer = ?
    `).run(skillsJson, confidence, agentId, body.domain, body.layer);

    const updated = queryOne(
      'SELECT * FROM agent_capabilities WHERE agent_id = ? AND domain = ? AND layer = ?',
      [agentId, body.domain, body.layer]
    );

    return apiSuccess({
      message: 'Capability updated',
      capability: updated
    });
  } else {
    // Insert new capability
    db.prepare(`
      INSERT INTO agent_capabilities (id, agent_id, domain, layer, skills, confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(capabilityId, agentId, body.domain, body.layer, skillsJson, confidence);

    const created = queryOne(
      'SELECT * FROM agent_capabilities WHERE id = ?',
      [capabilityId]
    );

    return apiSuccess({
      message: 'Capability created',
      capability: created
    }, 201);
  }
});

/**
 * GET /api/agents/:id/capabilities
 * 
 * Get all capabilities for a specific agent
 */
export const GET = withErrorHandler<{ params: Promise<{ id: string }> }>(async (request, context) => {
  const { id: agentId } = await extractParams<{ id: string }>(context);

  // Verify agent exists
  const agent = queryOne<Agent>('SELECT id, name FROM agents WHERE id = ?', [agentId]);
  const agentError = checkEntityExists(agent, 'Agent');
  if (agentError) return agentError;

  const db = getDb();
  const capabilities = db.prepare(
    'SELECT * FROM agent_capabilities WHERE agent_id = ? ORDER BY domain, layer'
  ).all(agentId);

  return apiSuccess({
    agent_id: agentId,
    agent_name: (agent as any).name,
    capabilities,
    count: capabilities.length
  });
});
