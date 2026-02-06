/**
 * OpenClaw Session Monitor
 * Watches for session completions and triggers the completion hook
 * 
 * This service polls OpenClaw for active sessions and compares with our DB,
 * detecting when sessions have ended and triggering auto-reports.
 * 
 * Date: 2026-02-06
 */

import { getOpenClawClient } from './client';
import { getDb } from '@/lib/db';
import { onSessionComplete } from './session-completion-hook';
import type Database from 'better-sqlite3';

interface DbSession {
  id: string;
  openclaw_session_id: string;
  agent_id: string | null;
  task_id: string | null;
  status: string;
  created_at: string;
}

export class SessionMonitor {
  private interval: NodeJS.Timeout | null = null;
  private running = false;
  private pollIntervalMs = 30000; // Check every 30 seconds
  private lastCheck = new Date();

  constructor(pollIntervalMs = 30000) {
    this.pollIntervalMs = pollIntervalMs;
  }

  /**
   * Start monitoring sessions
   */
  start(): void {
    if (this.running) {
      console.log('[SessionMonitor] Already running');
      return;
    }

    console.log(`[SessionMonitor] Starting session monitor (polling every ${this.pollIntervalMs}ms)`);
    this.running = true;
    
    // Run initial check
    this.checkSessions().catch((err) => {
      console.error('[SessionMonitor] Initial check failed:', err);
    });

    // Set up periodic polling
    this.interval = setInterval(() => {
      this.checkSessions().catch((err) => {
        console.error('[SessionMonitor] Check failed:', err);
      });
    }, this.pollIntervalMs);
  }

  /**
   * Stop monitoring sessions
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    console.log('[SessionMonitor] Stopped');
  }

  /**
   * Check for completed sessions and trigger hooks
   */
  private async checkSessions(): Promise<void> {
    try {
      const db = getDb();
      
      // Get all active sessions from DB
      const activeSessions = db.prepare(`
        SELECT id, openclaw_session_id, agent_id, task_id, status, created_at
        FROM openclaw_sessions
        WHERE status = 'active'
      `).all() as DbSession[];

      if (activeSessions.length === 0) {
        console.log('[SessionMonitor] No active sessions to check');
        return;
      }

      console.log(`[SessionMonitor] Checking ${activeSessions.length} active session(s)`);

      // Get current live sessions from OpenClaw
      const client = getOpenClawClient();
      
      // Connect if needed
      if (!client.isConnected()) {
        try {
          await client.connect();
        } catch (err) {
          console.error('[SessionMonitor] Failed to connect to OpenClaw:', err);
          return;
        }
      }

      const liveSessionsResponse = await client.listSessions();
      const liveSessions = Array.isArray(liveSessionsResponse)
        ? liveSessionsResponse
        : (liveSessionsResponse as any)?.sessions || [];
      
      const liveSessionIds = new Set(
        liveSessions.map((s: any) => s.id || s.sessionId || s.key)
      );

      console.log(`[SessionMonitor] Found ${liveSessions.length} live OpenClaw session(s)`);

      // Check each active DB session
      for (const dbSession of activeSessions) {
        const isLive = liveSessionIds.has(dbSession.openclaw_session_id);

        if (!isLive) {
          // Session has ended - mark as completed and trigger hook
          console.log(
            `[SessionMonitor] Session ${dbSession.openclaw_session_id} has ended`
          );

          await this.handleCompletedSession(db, dbSession);
        }
      }

      this.lastCheck = new Date();
    } catch (error) {
      console.error('[SessionMonitor] Error checking sessions:', error);
    }
  }

  /**
   * Handle a session that has completed
   */
  private async handleCompletedSession(
    db: Database.Database,
    session: DbSession
  ): Promise<void> {
    const endedAt = new Date().toISOString();

    try {
      // Update session status in DB
      db.prepare(`
        UPDATE openclaw_sessions 
        SET status = ?, ended_at = ?, updated_at = ?
        WHERE id = ?
      `).run('completed', endedAt, endedAt, session.id);

      console.log(`[SessionMonitor] Updated session ${session.id} to completed`);

      // If session has task and agent, trigger completion hook
      if (session.task_id && session.agent_id) {
        console.log(
          `[SessionMonitor] Triggering completion hook for task ${session.task_id}`
        );

        await onSessionComplete(db, {
          sessionId: session.id,
          openclawSessionId: session.openclaw_session_id,
          taskId: session.task_id,
          agentId: session.agent_id,
          startedAt: session.created_at,
          endedAt,
          status: 'completed',
        });

        // Update agent status to idle
        db.prepare('UPDATE agents SET status = ? WHERE id = ?').run(
          'idle',
          session.agent_id
        );
      }
    } catch (error) {
      console.error(
        `[SessionMonitor] Failed to handle completed session ${session.id}:`,
        error
      );
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getLastCheck(): Date {
    return this.lastCheck;
  }
}

// Singleton instance
let monitorInstance: SessionMonitor | null = null;

/**
 * Get or create the session monitor singleton
 */
export function getSessionMonitor(): SessionMonitor {
  if (!monitorInstance) {
    monitorInstance = new SessionMonitor();
  }
  return monitorInstance;
}

/**
 * Start the session monitor (idempotent)
 */
export function startSessionMonitor(): void {
  const monitor = getSessionMonitor();
  if (!monitor.isRunning()) {
    monitor.start();
  }
}

/**
 * Stop the session monitor
 */
export function stopSessionMonitor(): void {
  if (monitorInstance) {
    monitorInstance.stop();
  }
}
