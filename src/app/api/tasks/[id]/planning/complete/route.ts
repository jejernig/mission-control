import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// POST /api/tasks/[id]/planning/complete - Complete planning with a spec (for background agents)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  try {
    const body = await request.json();
    const { spec, agents, execution_plan } = body;

    if (!spec || !agents) {
      return NextResponse.json(
        { error: 'spec and agents are required' },
        { status: 400 }
      );
    }

    // Get task
    const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as {
      id: string;
      title: string;
      description: string;
      status: string;
      workspace_id: string;
      planning_complete?: number;
    } | undefined;

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (task.planning_complete === 1) {
      return NextResponse.json(
        { error: 'Planning already complete' },
        { status: 400 }
      );
    }

    // Build planning_messages to store the analysis
    const messages = [
      {
        role: 'user',
        content: `PLANNING REQUEST\n\nTask Title: ${task.title}\nTask Description: ${task.description}`,
        timestamp: Date.now(),
      },
      {
        role: 'assistant',
        content: JSON.stringify({
          status: 'complete',
          spec,
          agents,
          execution_plan,
        }),
        timestamp: Date.now(),
      },
    ];

    // Update task with completed planning
    getDb()
      .prepare(
        `
      UPDATE tasks 
      SET planning_messages = ?, 
          planning_complete = 1,
          planning_spec = ?,
          planning_agents = ?,
          status = 'inbox'
      WHERE id = ?
    `
      )
      .run(
        JSON.stringify(messages),
        JSON.stringify(spec),
        JSON.stringify(agents),
        taskId
      );

    // Create the agents in the workspace and track first agent for auto-assign
    let firstAgentId: string | null = null;

    if (agents && agents.length > 0) {
      const insertAgent = getDb().prepare(`
        INSERT INTO agents (id, workspace_id, name, role, description, avatar_emoji, status, soul_md, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'standby', ?, datetime('now'), datetime('now'))
      `);

      for (const agent of agents) {
        const agentId = crypto.randomUUID();
        if (!firstAgentId) firstAgentId = agentId;

        insertAgent.run(
          agentId,
          task.workspace_id,
          agent.name,
          agent.role,
          agent.instructions || '',
          agent.avatar_emoji || '🤖',
          agent.soul_md || ''
        );
      }
    }

    // AUTO-DISPATCH: Assign to first agent and trigger dispatch
    if (firstAgentId) {
      // Assign task to the first created agent
      getDb()
        .prepare(
          `
        UPDATE tasks SET assigned_agent_id = ? WHERE id = ?
      `
        )
        .run(firstAgentId, taskId);

      console.log(`[Planning Complete] Auto-assigned task ${taskId} to agent ${firstAgentId}`);

      // Trigger dispatch
      const dispatchUrl = `http://localhost:${process.env.PORT || 3001}/api/tasks/${taskId}/dispatch`;
      console.log(`[Planning Complete] Triggering dispatch: ${dispatchUrl}`);

      try {
        const dispatchRes = await fetch(dispatchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (dispatchRes.ok) {
          const dispatchData = await dispatchRes.json();
          console.log(`[Planning Complete] Dispatch successful:`, dispatchData);
        } else {
          const errorText = await dispatchRes.text();
          console.error(`[Planning Complete] Dispatch failed (${dispatchRes.status}):`, errorText);
        }
      } catch (err) {
        console.error('[Planning Complete] Auto-dispatch error:', err);
      }
    }

    return NextResponse.json({
      success: true,
      taskId,
      spec,
      agents,
      executionPlan: execution_plan,
      autoDispatched: !!firstAgentId,
    });
  } catch (error) {
    console.error('Failed to complete planning:', error);
    return NextResponse.json(
      { error: 'Failed to complete planning: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
