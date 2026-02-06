/**
 * Root Cause Analysis (RCA) Service
 * Analyzes detected issues to identify root causes
 */

import type { Task } from '../types';
import type { DetectionResult } from './detection';
import { queryAll } from '../db';

export interface RCAResult {
  taskId: string;
  issueType: string;
  rootCause: string;
  analysis: string;
  confidence: number; // 0-1
  recommendations: string[];
  evidence: Record<string, any>;
}

export class RCAService {
  /**
   * Perform root cause analysis on a detected issue
   */
  async analyze(task: Task, detection: DetectionResult): Promise<RCAResult> {
    if (detection.issueType === 'phantom_implementation') {
      return this.analyzePhantomImplementation(task, detection);
    } else if (detection.issueType === 'stuck_task') {
      return this.analyzeStuckTask(task, detection);
    }

    throw new Error(`Unknown issue type: ${detection.issueType}`);
  }

  /**
   * Analyze phantom implementation issue
   */
  private async analyzePhantomImplementation(
    task: Task,
    detection: DetectionResult
  ): Promise<RCAResult> {
    const activities = queryAll<any>('SELECT * FROM task_activities WHERE task_id = ?', [task.id]);
    const deliverables = queryAll<any>('SELECT * FROM task_deliverables WHERE task_id = ?', [task.id]);

    // Analyze patterns in activities
    const hasCompletionActivity = activities.some(a =>
      ((a.message || "").toLowerCase()).includes('complet') ||
      ((a.message || "").toLowerCase()).includes('finish') ||
      ((a.message || "").toLowerCase()).includes('done')
    );

    const hasCodeActivity = activities.some(a =>
      ((a.message || "").toLowerCase()).includes('code') ||
      ((a.message || "").toLowerCase()).includes('implement') ||
      ((a.message || "").toLowerCase()).includes('develop')
    );

    const hasTestActivity = activities.some(a =>
      ((a.message || "").toLowerCase()).includes('test') ||
      ((a.message || "").toLowerCase()).includes('verif')
    );

    // Determine root cause
    let rootCause = 'unknown';
    let analysis = '';
    let confidence = 0.7;
    const recommendations: string[] = [];

    if (!hasCodeActivity && hasCompletionActivity) {
      rootCause = 'worker_confusion';
      analysis = 'Task was marked complete without any code implementation activities. ' +
        'This suggests the assigned agent may have misunderstood the task requirements or ' +
        'incorrectly assessed completion status.';
      confidence = 0.9;
      recommendations.push('Add verification gate: require code deliverables before marking tasks as done');
      recommendations.push('Improve task clarity: ensure implementation requirements are explicit');
      recommendations.push('Agent training: review completion criteria with assigned agent');
    } else if (hasCodeActivity && !deliverables.length) {
      rootCause = 'missing_deliverables';
      analysis = 'Activities indicate code work was done, but no deliverables were logged. ' +
        'This suggests a process failure in the deliverable tracking system.';
      confidence = 0.85;
      recommendations.push('Enforce deliverable logging before status transitions');
      recommendations.push('Add automated checks for code commits');
      recommendations.push('Review deliverable creation workflow');
    } else if (!hasTestActivity && hasCodeActivity) {
      rootCause = 'skipped_testing';
      analysis = 'Code implementation occurred without testing activities. ' +
        'Task may have been completed without proper validation.';
      confidence = 0.75;
      recommendations.push('Require testing phase before completion');
      recommendations.push('Add automated test execution gates');
      recommendations.push('Update task pipeline to enforce testing stage');
    } else {
      rootCause = 'premature_completion';
      analysis = 'Task was marked done prematurely without completing the full workflow. ' +
        'Root cause unclear from available evidence.';
      confidence = 0.6;
      recommendations.push('Review task completion criteria');
      recommendations.push('Investigate agent decision-making process');
      recommendations.push('Add manual review step for complex tasks');
    }

    return {
      taskId: task.id,
      issueType: 'phantom_implementation',
      rootCause,
      analysis,
      confidence,
      recommendations,
      evidence: {
        activityCount: activities.length,
        deliverableCount: deliverables.length,
        hasCompletionActivity,
        hasCodeActivity,
        hasTestActivity,
        ...detection.evidence,
      },
    };
  }

  /**
   * Analyze stuck task issue
   */
  private async analyzeStuckTask(
    task: Task,
    detection: DetectionResult
  ): Promise<RCAResult> {
    const activities = queryAll<any>('SELECT * FROM task_activities WHERE task_id = ?', [task.id]);
    const deliverables = queryAll<any>('SELECT * FROM task_deliverables WHERE task_id = ?', [task.id]);

    // Analyze activity patterns
    const recentActivities = activities.filter(a => {
      const activityDate = new Date(a.timestamp);
      const now = new Date();
      const hoursSinceActivity = (now.getTime() - activityDate.getTime()) / (1000 * 60 * 60);
      return hoursSinceActivity < 24;
    });

    const errorActivities = activities.filter(a =>
      ((a.message || "").toLowerCase()).includes('error') ||
      ((a.message || "").toLowerCase()).includes('fail') ||
      ((a.message || "").toLowerCase()).includes('block')
    );

    const questionActivities = activities.filter(a =>
      ((a.message || "").toLowerCase()).includes('question') ||
      ((a.message || "").toLowerCase()).includes('clarif') ||
      ((a.message || "").toLowerCase()).includes('unclear')
    );

    // Determine root cause
    let rootCause = 'unknown';
    let analysis = '';
    let confidence = 0.7;
    const recommendations: string[] = [];

    if (errorActivities.length > 0) {
      rootCause = 'technical_blocker';
      analysis = `Task has been stuck with ${errorActivities.length} error-related activities. ` +
        'Technical issues are preventing progress.';
      confidence = 0.85;
      recommendations.push('Review error logs and resolve technical issues');
      recommendations.push('Assign technical specialist to unblock');
      recommendations.push('Consider breaking task into smaller chunks');
    } else if (questionActivities.length > 0) {
      rootCause = 'requirements_unclear';
      analysis = `Task has ${questionActivities.length} clarification requests that may be unanswered. ` +
        'Unclear requirements are blocking progress.';
      confidence = 0.8;
      recommendations.push('Answer pending questions from assigned agent');
      recommendations.push('Provide additional context and examples');
      recommendations.push('Schedule clarification session');
    } else if (recentActivities.length === 0 && activities.length === 0) {
      rootCause = 'agent_not_started';
      analysis = 'No activities recorded. Assigned agent has not begun work on this task.';
      confidence = 0.9;
      recommendations.push('Ping assigned agent');
      recommendations.push('Check agent availability and workload');
      recommendations.push('Consider reassigning to different agent');
    } else if (recentActivities.length === 0 && activities.length > 0) {
      rootCause = 'agent_abandoned';
      analysis = 'Task had early activity but no recent progress. Agent may have abandoned work.';
      confidence = 0.75;
      recommendations.push('Check in with assigned agent');
      recommendations.push('Review agent capacity and priorities');
      recommendations.push('Consider task reassignment');
    } else {
      rootCause = 'complexity_underestimated';
      analysis = 'Task is taking longer than expected. Scope or complexity may have been underestimated.';
      confidence = 0.65;
      recommendations.push('Break task into smaller subtasks');
      recommendations.push('Re-estimate effort and timeline');
      recommendations.push('Add additional resources or expertise');
    }

    return {
      taskId: task.id,
      issueType: 'stuck_task',
      rootCause,
      analysis,
      confidence,
      recommendations,
      evidence: {
        activityCount: activities.length,
        recentActivityCount: recentActivities.length,
        errorActivityCount: errorActivities.length,
        questionActivityCount: questionActivities.length,
        deliverableCount: deliverables.length,
        ...detection.evidence,
      },
    };
  }

  /**
   * Generate a human-readable RCA report
   */
  generateReport(rca: RCAResult): string {
    let report = `## Root Cause Analysis\n\n`;
    report += `**Task ID:** ${rca.taskId}\n`;
    report += `**Issue Type:** ${rca.issueType}\n`;
    report += `**Root Cause:** ${rca.rootCause}\n`;
    report += `**Confidence:** ${(rca.confidence * 100).toFixed(0)}%\n\n`;
    report += `### Analysis\n\n${rca.analysis}\n\n`;
    report += `### Recommendations\n\n`;
    rca.recommendations.forEach((rec, i) => {
      report += `${i + 1}. ${rec}\n`;
    });
    report += `\n### Evidence\n\n`;
    report += '```json\n';
    report += JSON.stringify(rca.evidence, null, 2);
    report += '\n```\n';

    return report;
  }
}
