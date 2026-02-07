import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, run } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';

interface SpawnRequest {
  id: string;
  task_id: string;
  task_title: string;
  task_description: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  session_key: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// GET /api/internal/spawn-requests - Get pending spawn requests
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const limit = parseInt(searchParams.get('limit') || '10');

    const requests = queryAll<SpawnRequest>(
      `SELECT * FROM spawn_requests 
       WHERE status = ? 
       ORDER BY created_at ASC 
       LIMIT ?`,
      [status, limit]
    );

    return NextResponse.json(requests);
  } catch (error) {
    console.error('Failed to fetch spawn requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch spawn requests' },
      { status: 500 }
    );
  }
}

// POST /api/internal/spawn-requests - Create new spawn request
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { task_id, task_title, task_description } = body;

    // Support both task-based (architects) and generic (workers) spawn requests
    let title = task_title;
    let description = task_description;
    const taskId = task_id || null;

    // If task_id provided, fetch task details
    if (task_id) {
      const task = queryAll<any>(
        `SELECT title, description FROM tasks WHERE id = ?`,
        [task_id]
      )[0];

      if (!task) {
        return NextResponse.json(
          { error: `Task ${task_id} not found` },
          { status: 404 }
        );
      }

      title = task.title;
      description = task.description || null;
    } else if (!task_title) {
      // If no task_id and no task_title, reject
      return NextResponse.json(
        { error: 'Either task_id or task_title is required' },
        { status: 400 }
      );
    }

    const id = uuidv4();
    const created_at = new Date().toISOString();

    run(
      `INSERT INTO spawn_requests (id, task_id, task_title, task_description, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [id, taskId, title, description || null, created_at]
    );

    // Wake Jarvis immediately to process the spawn request
    try {
      const client = getOpenClawClient();
      if (!client.isConnected()) {
        await client.connect();
      }
      await client.wake(`New spawn request: ${title}`);
      console.log('[SpawnRequest] Woke Jarvis for:', title);
    } catch (error) {
      // Don't fail the request if wake fails - Jarvis will pick it up on next heartbeat
      console.error('[SpawnRequest] Failed to wake Jarvis:', error);
    }

    return NextResponse.json({ id, status: 'pending', created_at });
  } catch (error) {
    console.error('Failed to create spawn request:', error);
    return NextResponse.json(
      { error: 'Failed to create spawn request' },
      { status: 500 }
    );
  }
}

// PATCH /api/internal/spawn-requests/[id] - Update spawn request status
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, session_key, error } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (status) {
      updates.push('status = ?');
      values.push(status);

      if (status === 'processing') {
        updates.push('started_at = ?');
        values.push(new Date().toISOString());
      } else if (status === 'completed' || status === 'failed') {
        updates.push('completed_at = ?');
        values.push(new Date().toISOString());
      }
    }

    if (session_key) {
      updates.push('session_key = ?');
      values.push(session_key);
    }

    if (error) {
      updates.push('error = ?');
      values.push(error);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No updates provided' },
        { status: 400 }
      );
    }

    values.push(id);

    run(`UPDATE spawn_requests SET ${updates.join(', ')} WHERE id = ?`, values);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update spawn request:', error);
    return NextResponse.json(
      { error: 'Failed to update spawn request' },
      { status: 500 }
    );
  }
}
