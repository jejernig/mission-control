/**
 * GET /api/tasks/:id/suggestions
 * 
 * Retrieves saved agent assignment suggestions for a task
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { agentMatcher } from '@/lib/services/agent-matcher';
import type { Task } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify task exists
    const task = queryOne<Task>('SELECT id FROM tasks WHERE id = ?', [id]);
    
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Get saved suggestions
    const suggestions = await agentMatcher.getSuggestions(id);

    return NextResponse.json({
      task_id: id,
      suggestions,
      count: suggestions.length
    });
  } catch (error) {
    console.error('[API] Failed to fetch suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch suggestions' },
      { status: 500 }
    );
  }
}
