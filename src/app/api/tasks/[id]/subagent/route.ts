/**
 * Subagent Registration API
 * Register OpenClaw sub-agent sessions for tasks
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { getOpenClawClient } from '@/lib/openclaw/client';

/**
 * POST /api/tasks/[id]/subagent
 * Register a sub-agent session for a task
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const body = await request.json();
    
    const { openclaw_session_id, agent_name } = body;

    if (!openclaw_session_id) {
      return NextResponse.json(
        { error: 'openclaw_session_id is required' },
        { status: 400 }
      );
    }

    const db = getDb();
    const sessionId = crypto.randomUUID();

    // Create a placeholder agent if agent_name is provided
    // Otherwise, we'll need to link to an existing agent
    let agentId = null;
    
    if (agent_name) {
      // Check if agent already exists
      const existingAgent = db.prepare('SELECT id FROM agents WHERE name = ?').get(agent_name) as { id: string } | undefined;
      
      if (existingAgent) {
        agentId = existingAgent.id;
      } else {
        // Create temporary sub-agent record
        agentId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO agents (id, name, role, description, status)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          agentId,
          agent_name,
          'Sub-Agent',
          'Automatically created sub-agent',
          'working'
        );
      }
    }

    // Insert OpenClaw session record
    db.prepare(`
      INSERT INTO openclaw_sessions 
        (id, agent_id, openclaw_session_id, session_type, task_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      agentId,
      openclaw_session_id,
      'subagent',
      taskId,
      'active'
    );

    // Get the created session
    const session = db.prepare(`
      SELECT * FROM openclaw_sessions WHERE id = ?
    `).get(sessionId);

    // Broadcast agent spawned event
    broadcast({
      type: 'agent_spawned',
      payload: {
        taskId,
        sessionId: openclaw_session_id,
        agentName: agent_name,
      },
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error('Error registering sub-agent:', error);
    return NextResponse.json(
      { error: 'Failed to register sub-agent' },
      { status: 500 }
    );
  }
}

interface OpenClawLiveSession {
  key: string;
  sessionId: string;
  label?: string;
  displayName?: string;
  channel?: string;
  updatedAt: number;
  totalTokens: number;
  model?: string;
  abortedLastRun?: boolean;
}

interface DbSession {
  id: string;
  agent_id: string | null;
  openclaw_session_id: string;
  channel: string | null;
  status: string;
  session_type: string;
  task_id: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  agent_name?: string;
  agent_avatar_emoji?: string;
}

/**
 * GET /api/tasks/[id]/subagent
 * Get all sub-agent sessions for a task (from DB + live from OpenClaw)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const db = getDb();

    // Get sessions registered in DB for this task
    const dbSessions = db.prepare(`
      SELECT 
        s.*,
        a.name as agent_name,
        a.avatar_emoji as agent_avatar_emoji
      FROM openclaw_sessions s
      LEFT JOIN agents a ON s.agent_id = a.id
      WHERE s.task_id = ? AND s.session_type = 'subagent'
      ORDER BY s.created_at DESC
    `).all(taskId) as DbSession[];

    // Also try to get live sessions from OpenClaw Gateway
    let liveSessions: OpenClawLiveSession[] = [];
    try {
      const client = getOpenClawClient();
      if (!client.isConnected()) {
        await client.connect();
      }
      const allSessions = await client.listSessions() as OpenClawLiveSession[];
      // Filter to only subagent sessions
      liveSessions = allSessions.filter((s: OpenClawLiveSession) => 
        s.key?.includes(':subagent:')
      );
    } catch (e) {
      console.warn('Could not fetch live OpenClaw sessions:', e);
    }

    // Merge: add live sessions that aren't already in DB results
    const dbSessionKeys = new Set(dbSessions.map(s => s.openclaw_session_id));
    
    const mergedSessions = [...dbSessions];
    
    for (const live of liveSessions) {
      if (!dbSessionKeys.has(live.key) && !dbSessionKeys.has(live.sessionId)) {
        // Convert live session to our format
        // Extract agent name from session key (e.g., "agent:code-reviewer:subagent:xxx")
        const keyParts = live.key?.split(':') || [];
        const agentName = keyParts[1] || 'Unknown Agent';
        
        mergedSessions.push({
          id: live.sessionId || live.key,
          agent_id: null,
          openclaw_session_id: live.key,
          channel: live.channel || null,
          status: live.abortedLastRun ? 'failed' : 'active',
          session_type: 'subagent',
          task_id: null, // Live sessions don't have task association
          ended_at: null,
          created_at: new Date(live.updatedAt).toISOString(),
          updated_at: new Date(live.updatedAt).toISOString(),
          agent_name: agentName,
          agent_avatar_emoji: '🤖',
          // Extra fields for live sessions
          // @ts-expect-error - adding extra fields for live sessions
          _live: true,
          // @ts-expect-error - adding extra fields for live sessions
          _label: live.label,
          // @ts-expect-error - adding extra fields for live sessions
          _totalTokens: live.totalTokens,
          // @ts-expect-error - adding extra fields for live sessions
          _model: live.model,
        });
      }
    }

    return NextResponse.json(mergedSessions);
  } catch (error) {
    console.error('Error fetching sub-agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sub-agents' },
      { status: 500 }
    );
  }
}
