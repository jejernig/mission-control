/**
 * POST /api/tasks/:id/analyze
 * 
 * Analyzes a task to determine domain, layer, skills, and generate agent suggestions
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { taskAnalyzer } from '@/lib/services/task-analyzer';
import { agentMatcher } from '@/lib/services/agent-matcher';
import type { Task, AnalyzeTaskResponse } from '@/lib/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch the task
    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Analyze the task
    const analysis = taskAnalyzer.analyze(task);

    // Find matching agents
    const matches = await agentMatcher.findMatches(analysis, task.workspace_id);

    // Save suggestions to database
    await agentMatcher.saveSuggestions(task.id, matches);

    const response: AnalyzeTaskResponse = {
      task_id: task.id,
      analysis,
      analyzed_at: new Date().toISOString()
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[API] Task analysis failed:', error);
    return NextResponse.json(
      { error: 'Failed to analyze task' },
      { status: 500 }
    );
  }
}
