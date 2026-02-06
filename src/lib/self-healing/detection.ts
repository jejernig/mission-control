/**
 * Detection Service
 * Monitors tasks for anomalies and issues
 */

import type { Task } from '../types';
import { getDb } from '../db';

export interface DetectionResult {
  issueDetected: boolean;
  issueType: 'phantom_implementation' | 'stuck_task' | 'none';
  severity: 'critical' | 'high' | 'medium' | 'low';
  taskId: string;
  evidence: {
    commitCount?: number;
    timeInProgress?: number;
    lastUpdate?: Date;
    [key: string]: any;
  };
}

export interface DetectionConfig {
  phantomDetection: {
    enabled: boolean;
    minTimeSinceDone: number; // minutes
  };
  stuckDetection: {
    enabled: boolean;
    timeThreshold: number; // hours
  };
  cooldownPeriod: number; // minutes
  gracePeriod: number; // minutes for new tasks
  whitelist: string[]; // task patterns to ignore
}

export class DetectionService {
  private config: DetectionConfig;
  private detectionHistory: Map<string, number> = new Map(); // taskId -> last detection timestamp

  constructor(config: Partial<DetectionConfig> = {}) {
    this.config = {
      phantomDetection: {
        enabled: true,
        minTimeSinceDone: 15,
        ...config.phantomDetection,
      },
      stuckDetection: {
        enabled: true,
        timeThreshold: 4,
        ...config.stuckDetection,
      },
      cooldownPeriod: config.cooldownPeriod ?? 60,
      gracePeriod: config.gracePeriod ?? 30,
      whitelist: config.whitelist ?? ['maintenance', 'monitoring'],
    };
  }

  /**
   * Check a task for issues
   */
  async detectIssues(task: Task): Promise<DetectionResult> {
    // Apply whitelist filter
    if (this.isWhitelisted(task)) {
      return this.noIssue(task.id);
    }

    // Apply grace period for new tasks
    if (this.isInGracePeriod(task)) {
      return this.noIssue(task.id);
    }

    // Apply cooldown period
    if (this.isInCooldown(task.id)) {
      return this.noIssue(task.id);
    }

    // Check for phantom implementation
    if (this.config.phantomDetection.enabled && task.status === 'done') {
      const phantomResult = await this.detectPhantomImplementation(task);
      if (phantomResult.issueDetected) {
        this.recordDetection(task.id);
        return phantomResult;
      }
    }

    // Check for stuck task
    if (this.config.stuckDetection.enabled && task.status === 'in_progress') {
      const stuckResult = await this.detectStuckTask(task);
      if (stuckResult.issueDetected) {
        this.recordDetection(task.id);
        return stuckResult;
      }
    }

    return this.noIssue(task.id);
  }

  /**
   * Detect phantom implementation (task marked done with no commits)
   */
  private async detectPhantomImplementation(task: Task): Promise<DetectionResult> {
    // Check if task was recently marked done
    const updatedAt = new Date(task.updated_at);
    const now = new Date();
    const minutesSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60);

    if (minutesSinceUpdate < this.config.phantomDetection.minTimeSinceDone) {
      return this.noIssue(task.id);
    }

    // Get deliverables to check for commits
    const deliverables = await db.getDeliverables(task.id);
    
    // Count commits in deliverables
    let commitCount = 0;
    for (const deliverable of deliverables) {
      if (deliverable.type === 'code' || deliverable.type === 'commit') {
        commitCount++;
      }
      // Also check URL patterns for git commits
      if (deliverable.url && (
        deliverable.url.includes('/commit/') || 
        deliverable.url.includes('/commits/')
      )) {
        commitCount++;
      }
    }

    // Check activities for commit mentions
    const activities = await db.getActivities(task.id);
    for (const activity of activities) {
      if (
        activity.action.toLowerCase().includes('commit') ||
        activity.action.toLowerCase().includes('pushed') ||
        activity.action.toLowerCase().includes('merge')
      ) {
        commitCount++;
      }
    }

    if (commitCount === 0) {
      return {
        issueDetected: true,
        issueType: 'phantom_implementation',
        severity: 'high',
        taskId: task.id,
        evidence: {
          commitCount: 0,
          lastUpdate: updatedAt,
          minutesSinceUpdate,
        },
      };
    }

    return this.noIssue(task.id);
  }

  /**
   * Detect stuck task (in progress for too long)
   */
  private async detectStuckTask(task: Task): Promise<DetectionResult> {
    const updatedAt = new Date(task.updated_at);
    const now = new Date();
    const hoursInProgress = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);

    if (hoursInProgress >= this.config.stuckDetection.timeThreshold) {
      // Check if there's been any recent activity
      const activities = await db.getActivities(task.id);
      const recentActivities = activities.filter(a => {
        const activityDate = new Date(a.timestamp);
        const hoursSinceActivity = (now.getTime() - activityDate.getTime()) / (1000 * 60 * 60);
        return hoursSinceActivity < 2; // Activity in last 2 hours
      });

      // If there's recent activity, task is not stuck
      if (recentActivities.length > 0) {
        return this.noIssue(task.id);
      }

      return {
        issueDetected: true,
        issueType: 'stuck_task',
        severity: hoursInProgress > 24 ? 'critical' : 'high',
        taskId: task.id,
        evidence: {
          timeInProgress: hoursInProgress,
          lastUpdate: updatedAt,
          activityCount: activities.length,
          recentActivityCount: recentActivities.length,
        },
      };
    }

    return this.noIssue(task.id);
  }

  /**
   * Scan all tasks for issues
   */
  async scanAllTasks(): Promise<DetectionResult[]> {
    const tasks = await db.getAllTasks();
    const results: DetectionResult[] = [];

    for (const task of tasks) {
      // Only scan done and in_progress tasks
      if (task.status === 'done' || task.status === 'in_progress') {
        const result = await this.detectIssues(task);
        if (result.issueDetected) {
          results.push(result);
        }
      }
    }

    return results;
  }

  // Helper methods

  private isWhitelisted(task: Task): boolean {
    const titleLower = task.title.toLowerCase();
    return this.config.whitelist.some(pattern => titleLower.includes(pattern.toLowerCase()));
  }

  private isInGracePeriod(task: Task): boolean {
    const createdAt = new Date(task.created_at);
    const now = new Date();
    const minutesSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60);
    return minutesSinceCreation < this.config.gracePeriod;
  }

  private isInCooldown(taskId: string): boolean {
    const lastDetection = this.detectionHistory.get(taskId);
    if (!lastDetection) return false;

    const now = Date.now();
    const minutesSinceLastDetection = (now - lastDetection) / (1000 * 60);
    return minutesSinceLastDetection < this.config.cooldownPeriod;
  }

  private recordDetection(taskId: string): void {
    this.detectionHistory.set(taskId, Date.now());
  }

  private noIssue(taskId: string): DetectionResult {
    return {
      issueDetected: false,
      issueType: 'none',
      severity: 'low',
      taskId,
      evidence: {},
    };
  }
}
