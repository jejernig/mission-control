/**
 * Issue Detection Engine
 * 
 * Monitors Mission Control for pipeline failures and detects:
 * 1. Phantom implementations - Tasks marked done with 0 commits
 * 2. Stuck tasks - Tasks in_progress with no activity for >4 hours
 * 3. Activity anomalies - Pattern matching for "blocked", "failed", "error" keywords
 */

import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import { MissionControlClient } from './mission-control-client';

export interface DetectionConfig {
  stuckTaskHours: number;
  cooldownMinutes: number;
  detectionInterval: number;
  dbPath: string;
  missionControlDbPath: string;
}

export interface DetectedIssue {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  source: string;
  error_type: string;
  metadata: Record<string, any>;
  detected_at: number;
}

export class IssueDetector {
  private db: Database.Database;
  private mcClient: MissionControlClient;
  private config: DetectionConfig;
  private lastDetection: Map<string, number> = new Map();

  constructor(config: DetectionConfig) {
    this.config = config;
    this.db = new Database(config.dbPath);
    this.mcClient = new MissionControlClient(config.missionControlDbPath);
    
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
  }

  /**
   * Run all detection algorithms
   */
  async detectIssues(): Promise<DetectedIssue[]> {
    const now = Date.now();
    const issues: DetectedIssue[] = [];

    console.log(`[${new Date().toISOString()}] Running issue detection...`);

    try {
      // 1. Detect phantom implementations
      const phantomIssues = await this.detectPhantomImplementations();
      issues.push(...phantomIssues);

      // 2. Detect stuck tasks
      const stuckIssues = await this.detectStuckTasks();
      issues.push(...stuckIssues);

      // 3. Detect activity anomalies
      const anomalyIssues = await this.detectActivityAnomalies();
      issues.push(...anomalyIssues);

      // Filter out issues in cooldown period
      const filteredIssues = issues.filter(issue => {
        const issueKey = this.getIssueKey(issue);
        const lastDetected = this.lastDetection.get(issueKey);
        
        if (lastDetected) {
          const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
          if (now - lastDetected < cooldownMs) {
            console.log(`[COOLDOWN] Skipping issue: ${issue.title} (last detected ${Math.round((now - lastDetected) / 1000 / 60)} minutes ago)`);
            return false;
          }
        }
        
        return true;
      });

      // Log detected issues to database
      for (const issue of filteredIssues) {
        this.logIssue(issue);
        const issueKey = this.getIssueKey(issue);
        this.lastDetection.set(issueKey, now);
        console.log(`[DETECTED] ${issue.severity.toUpperCase()}: ${issue.title}`);
      }

      console.log(`[${new Date().toISOString()}] Detection complete. Found ${filteredIssues.length} new issues (${issues.length - filteredIssues.length} in cooldown).`);

      return filteredIssues;
    } catch (error) {
      console.error('[ERROR] Detection failed:', error);
      // Don't crash the service on error
      return [];
    }
  }

  /**
   * Detect tasks marked done with zero git commits
   */
  private async detectPhantomImplementations(): Promise<DetectedIssue[]> {
    const issues: DetectedIssue[] = [];

    try {
      const tasks = this.mcClient.getTasksByStatus('done');
      
      for (const task of tasks) {
        // Check if task has any git commits
        const deliverables = this.mcClient.getDeliverablesByTask(task.id);
        const hasCommits = deliverables.some(d => 
          d.type === 'git_commit' || 
          d.type === 'pr' ||
          (d.content && (d.content.includes('commit') || d.content.includes('PR') || d.content.includes('pull request')))
        );

        if (!hasCommits) {
          issues.push({
            id: uuidv4(),
            title: `Phantom Implementation: ${task.title}`,
            description: `Task "${task.title}" (${task.id}) is marked as DONE but has no git commits or deliverables indicating actual implementation.`,
            severity: 'high',
            source: 'phantom_detector',
            error_type: 'phantom_implementation',
            metadata: {
              task_id: task.id,
              task_title: task.title,
              task_status: task.status,
              deliverable_count: deliverables.length,
              updated_at: task.updated_at
            },
            detected_at: Date.now()
          });
        }
      }
    } catch (error) {
      console.error('[ERROR] Phantom detection failed:', error);
    }

    return issues;
  }

  /**
   * Detect tasks stuck in_progress with no activity for >4 hours
   */
  private async detectStuckTasks(): Promise<DetectedIssue[]> {
    const issues: DetectedIssue[] = [];

    try {
      const tasks = this.mcClient.getTasksByStatus('in_progress');
      const thresholdMs = this.config.stuckTaskHours * 60 * 60 * 1000;
      const now = Date.now();

      for (const task of tasks) {
        // Get last activity for this task
        const lastActivity = this.mcClient.getLastActivityForTask(task.id);
        
        const lastActivityTime = lastActivity 
          ? new Date(lastActivity.created_at).getTime()
          : new Date(task.updated_at).getTime();

        const idleTime = now - lastActivityTime;

        if (idleTime > thresholdMs) {
          const idleHours = Math.round(idleTime / 1000 / 60 / 60);
          
          issues.push({
            id: uuidv4(),
            title: `Stuck Task: ${task.title}`,
            description: `Task "${task.title}" (${task.id}) has been in IN_PROGRESS status with no activity for ${idleHours} hours.`,
            severity: idleHours > 24 ? 'critical' : 'high',
            source: 'stuck_task_detector',
            error_type: 'stuck_task',
            metadata: {
              task_id: task.id,
              task_title: task.title,
              task_status: task.status,
              idle_hours: idleHours,
              last_activity_at: lastActivity?.created_at || task.updated_at,
              assigned_agent_id: task.assigned_agent_id
            },
            detected_at: Date.now()
          });
        }
      }
    } catch (error) {
      console.error('[ERROR] Stuck task detection failed:', error);
    }

    return issues;
  }

  /**
   * Detect activity anomalies - keywords like "blocked", "failed", "error"
   */
  private async detectActivityAnomalies(): Promise<DetectedIssue[]> {
    const issues: DetectedIssue[] = [];

    try {
      const keywords = ['blocked', 'failed', 'error', 'stuck', 'cannot', 'issue', 'problem'];
      const recentActivities = this.mcClient.getRecentActivities(24); // Last 24 hours

      for (const activity of recentActivities) {
        const content = (activity.content || '').toLowerCase();
        
        const matchedKeywords = keywords.filter(keyword => content.includes(keyword));
        
        if (matchedKeywords.length > 0) {
          // Check if we already detected this specific activity
          const issueKey = `anomaly:${activity.id}`;
          if (this.lastDetection.has(issueKey)) {
            continue; // Skip already detected activities
          }

          const task = activity.task_id ? this.mcClient.getTaskById(activity.task_id) : null;
          
          issues.push({
            id: uuidv4(),
            title: `Activity Anomaly: ${matchedKeywords.join(', ')} detected`,
            description: `Activity in ${task ? `task "${task.title}"` : 'system'} contains concerning keywords: ${matchedKeywords.join(', ')}. Content: "${activity.content?.substring(0, 200)}..."`,
            severity: matchedKeywords.includes('failed') || matchedKeywords.includes('error') ? 'high' : 'medium',
            source: 'anomaly_detector',
            error_type: 'activity_anomaly',
            metadata: {
              activity_id: activity.id,
              task_id: activity.task_id,
              task_title: task?.title,
              matched_keywords: matchedKeywords,
              activity_content: activity.content,
              activity_type: activity.type,
              agent_id: activity.agent_id,
              created_at: activity.created_at
            },
            detected_at: Date.now()
          });
        }
      }
    } catch (error) {
      console.error('[ERROR] Activity anomaly detection failed:', error);
    }

    return issues;
  }

  /**
   * Log issue to database
   */
  private logIssue(issue: DetectedIssue): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO issues (
          id, title, description, severity, status, source, 
          error_type, metadata, detected_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        issue.id,
        issue.title,
        issue.description,
        issue.severity,
        'detected',
        issue.source,
        issue.error_type,
        JSON.stringify(issue.metadata),
        Math.floor(issue.detected_at / 1000), // Convert to Unix timestamp (seconds)
        Math.floor(Date.now() / 1000)
      );
    } catch (error) {
      console.error('[ERROR] Failed to log issue to database:', error);
    }
  }

  /**
   * Generate unique key for issue to track cooldown
   */
  private getIssueKey(issue: DetectedIssue): string {
    // For activity anomalies, use activity_id to avoid re-detecting same activity
    if (issue.metadata.activity_id) {
      return `anomaly:${issue.metadata.activity_id}`;
    }
    
    // For task-based issues, use task_id + error_type
    if (issue.metadata.task_id) {
      return `${issue.error_type}:${issue.metadata.task_id}`;
    }

    // Fallback to title + error_type
    return `${issue.error_type}:${issue.title}`;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
