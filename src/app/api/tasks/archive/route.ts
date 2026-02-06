/**
 * Task Archive API
 * Archive completed tasks and retrieve archived tasks
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_agent_id: string | null;
  created_by_agent_id: string | null;
  workspace_id: string;
  business_id: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  planning_session_key: string | null;
  planning_messages: string | null;
  planning_complete: number;
  planning_spec: string | null;
  planning_agents: string | null;
}

interface Deliverable {
  id: string;
  deliverable_type: string;
  title: string;
  path: string | null;
  description: string | null;
  created_at: string;
}

interface Activity {
  id: string;
  activity_type: string;
  message: string;
  created_at: string;
}

/**
 * GET /api/tasks/archive
 * Retrieve archived tasks with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const db = getDb();

    let sql = 'SELECT * FROM tasks_archive';
    const params: unknown[] = [];

    if (workspaceId) {
      sql += ' WHERE workspace_id = ?';
      params.push(workspaceId);
    }

    sql += ' ORDER BY archived_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const archived = db.prepare(sql).all(...params);

    // Get total count
    let countSql = 'SELECT COUNT(*) as count FROM tasks_archive';
    const countParams: unknown[] = [];
    if (workspaceId) {
      countSql += ' WHERE workspace_id = ?';
      countParams.push(workspaceId);
    }
    const { count } = db.prepare(countSql).get(...countParams) as { count: number };

    return NextResponse.json({
      tasks: archived,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching archived tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch archived tasks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks/archive
 * Archive done tasks older than specified days
 * 
 * Body: { daysOld?: number } - default 7 days
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const daysOld = body.daysOld || 7;

    const db = getDb();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffStr = cutoffDate.toISOString();

    // Find tasks to archive
    const tasksToArchive = db.prepare(`
      SELECT * FROM tasks 
      WHERE status = 'done' 
      AND updated_at < ?
    `).all(cutoffStr) as Task[];

    if (tasksToArchive.length === 0) {
      return NextResponse.json({
        message: 'No tasks to archive',
        archived: 0,
      });
    }

    let archivedCount = 0;

    for (const task of tasksToArchive) {
      // Get deliverables
      const deliverables = db.prepare(
        'SELECT * FROM task_deliverables WHERE task_id = ?'
      ).all(task.id) as Deliverable[];

      // Get activities
      const activities = db.prepare(
        'SELECT * FROM task_activities WHERE task_id = ?'
      ).all(task.id) as Activity[];

      // Insert into archive
      db.prepare(`
        INSERT INTO tasks_archive (
          id, title, description, status, priority,
          assigned_agent_id, created_by_agent_id, workspace_id, business_id,
          due_date, created_at, updated_at,
          planning_session_key, planning_messages, planning_complete,
          planning_spec, planning_agents,
          deliverables_json, activities_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        task.id,
        task.title,
        task.description,
        task.status,
        task.priority,
        task.assigned_agent_id,
        task.created_by_agent_id,
        task.workspace_id,
        task.business_id,
        task.due_date,
        task.created_at,
        task.updated_at,
        task.planning_session_key,
        task.planning_messages,
        task.planning_complete,
        task.planning_spec,
        task.planning_agents,
        JSON.stringify(deliverables),
        JSON.stringify(activities)
      );

      // Delete from main tables (cascades to deliverables/activities)
      db.prepare('DELETE FROM task_deliverables WHERE task_id = ?').run(task.id);
      db.prepare('DELETE FROM task_activities WHERE task_id = ?').run(task.id);
      db.prepare('DELETE FROM openclaw_sessions WHERE task_id = ?').run(task.id);
      db.prepare('DELETE FROM events WHERE task_id = ?').run(task.id);
      db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);

      archivedCount++;
    }

    console.log(`[Archive] Archived ${archivedCount} tasks older than ${daysOld} days`);

    return NextResponse.json({
      message: `Archived ${archivedCount} tasks`,
      archived: archivedCount,
      cutoffDate: cutoffStr,
    });
  } catch (error) {
    console.error('Error archiving tasks:', error);
    return NextResponse.json(
      { error: 'Failed to archive tasks' },
      { status: 500 }
    );
  }
}
