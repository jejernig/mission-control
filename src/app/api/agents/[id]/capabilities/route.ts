/**
 * POST /api/agents/:id/capabilities
 * 
 * Adds or updates capabilities for a specific agent
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb, queryOne } from '@/lib/db';
import type { Agent, CreateCapabilityRequest } from '@/lib/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params;
    const body: CreateCapabilityRequest = await request.json();

    // Verify agent exists
    const agent = queryOne<Agent>('SELECT id FROM agents WHERE id = ?', [agentId]);
    
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Validate required fields
    if (!body.domain || !body.layer || !body.skills) {
      return NextResponse.json(
        { error: 'domain, layer, and skills are required' },
        { status: 400 }
      );
    }

    // Validate confidence range
    const confidence = body.confidence ?? 0.5;
    if (confidence < 0 || confidence > 1) {
      return NextResponse.json(
        { error: 'confidence must be between 0 and 1' },
        { status: 400 }
      );
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

      return NextResponse.json({
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

      return NextResponse.json({
        message: 'Capability created',
        capability: created
      }, { status: 201 });
    }
  } catch (error) {
    console.error('[API] Failed to create/update capability:', error);
    return NextResponse.json(
      { error: 'Failed to create/update capability' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agents/:id/capabilities
 * 
 * Get all capabilities for a specific agent
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params;

    // Verify agent exists
    const agent = queryOne<Agent>('SELECT id, name FROM agents WHERE id = ?', [agentId]);
    
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const db = getDb();
    const capabilities = db.prepare(
      'SELECT * FROM agent_capabilities WHERE agent_id = ? ORDER BY domain, layer'
    ).all(agentId);

    return NextResponse.json({
      agent_id: agentId,
      agent_name: (agent as any).name,
      capabilities,
      count: capabilities.length
    });
  } catch (error) {
    console.error('[API] Failed to fetch agent capabilities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch capabilities' },
      { status: 500 }
    );
  }
}
