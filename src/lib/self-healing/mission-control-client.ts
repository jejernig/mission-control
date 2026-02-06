/**
 * Mission Control Client
 * 
 * Client for querying Mission Control database
 */

import Database from 'better-sqlite3';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_agent_id: string | null;
  created_by_agent_id: string | null;
  workspace_id: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  task_id: string | null;
  agent_id: string | null;
  type: string;
  content: string | null;
  metadata: string | null;
  created_at: string;
}

export interface Deliverable {
  id: string;
  task_id: string;
  agent_id: string | null;
  type: string;
  title: string;
  content: string | null;
  file_path: string | null;
  url: string | null;
  status: string;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export class MissionControlClient {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { readonly: true, fileMustExist: true });
  }

  /**
   * Get all tasks by status
   */
  getTasksByStatus(status: string): Task[] {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks 
      WHERE status = ?
      ORDER BY updated_at DESC
    `);
    return stmt.all(status) as Task[];
  }

  /**
   * Get task by ID
   */
  getTaskById(taskId: string): Task | null {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks WHERE id = ?
    `);
    return stmt.get(taskId) as Task | null;
  }

  /**
   * Get deliverables for a task
   */
  getDeliverablesByTask(taskId: string): Deliverable[] {
    const stmt = this.db.prepare(`
      SELECT * FROM task_deliverables 
      WHERE task_id = ?
      ORDER BY created_at DESC
    `);
    return stmt.all(taskId) as Deliverable[];
  }

  /**
   * Get last activity for a task
   */
  getLastActivityForTask(taskId: string): Activity | null {
    const stmt = this.db.prepare(`
      SELECT * FROM task_activities 
      WHERE task_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
    return stmt.get(taskId) as Activity | null;
  }

  /**
   * Get recent activities (last N hours)
   */
  getRecentActivities(hours: number): Activity[] {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare(`
      SELECT * FROM task_activities 
      WHERE created_at > ?
      ORDER BY created_at DESC
    `);
    return stmt.all(cutoffTime) as Activity[];
  }

  /**
   * Get all activities for a task
   */
  getActivitiesByTask(taskId: string): Activity[] {
    const stmt = this.db.prepare(`
      SELECT * FROM task_activities 
      WHERE task_id = ?
      ORDER BY created_at ASC
    `);
    return stmt.all(taskId) as Activity[];
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
