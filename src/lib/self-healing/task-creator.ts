/**
 * Task Creator for Self-Healing System
 * 
 * Creates remediation tasks in Mission Control and logs activities.
 * Integrates with Mission Control API (POST /api/tasks, POST /api/tasks/:id/activities)
 */

import { v4 as uuidv4 } from 'uuid';
import { RankedFix } from './fix-ranking';
import { IssueContext } from './fix-templates';

export interface TaskCreationOptions {
  dry_run?: boolean;              // If true, don't actually create tasks
  assigned_agent_id?: string;     // Agent to assign task to
  workspace_id?: string;          // Workspace for the task
  business_id?: string;           // Business ID
  priority?: 'urgent' | 'high' | 'normal' | 'low';
}

export interface CreatedTask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigned_agent_id: string | null;
  workspace_id: string;
  business_id: string;
  created_at: string;
}

export interface ActivityLogEntry {
  id: string;
  task_id: string;
  agent_id: string | null;
  activity_type: string;
  content: string;
  created_at: string;
}

export interface TaskCreationResult {
  success: boolean;
  task?: CreatedTask;
  activity?: ActivityLogEntry;
  error?: string;
  dry_run: boolean;
}

/**
 * Create a remediation task from a ranked fix
 */
export async function createRemediationTask(
  issue: IssueContext,
  rankedFix: RankedFix,
  options: TaskCreationOptions = {}
): Promise<TaskCreationResult> {
  const {
    dry_run = false,
    assigned_agent_id = null,
    workspace_id = 'default',
    business_id = 'default',
    priority = 'normal'
  } = options;

  // If dry run, return mock result
  if (dry_run) {
    return {
      success: true,
      task: {
        id: `dry-run-${uuidv4()}`,
        title: rankedFix.title,
        description: rankedFix.description,
        status: 'inbox',
        priority,
        assigned_agent_id,
        workspace_id,
        business_id,
        created_at: new Date().toISOString()
      },
      activity: {
        id: `dry-run-activity-${uuidv4()}`,
        task_id: issue.id, // Original issue task
        agent_id: 'self-healing-system',
        activity_type: 'fix_generated',
        content: `[DRY RUN] Generated fix: ${rankedFix.title} (Score: ${rankedFix.ranking_score})`,
        created_at: new Date().toISOString()
      },
      dry_run: true
    };
  }

  try {
    // Create the task via API
    const taskData = {
      title: rankedFix.title,
      description: rankedFix.description,
      status: 'inbox',
      priority,
      assigned_agent_id,
      workspace_id,
      business_id,
      metadata: {
        source: 'self-healing',
        issue_id: issue.id,
        fix_category: rankedFix.category,
        fix_template: rankedFix.template_name,
        ranking_score: rankedFix.ranking_score,
        auto_applied: false,
        action_data: rankedFix.action_data
      }
    };

    const taskResponse = await fetch('http://localhost:3001/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData)
    });

    if (!taskResponse.ok) {
      throw new Error(`Failed to create task: ${taskResponse.statusText}`);
    }

    const createdTask = await taskResponse.json();

    // Log activity to the original issue task
    const activityData = {
      agent_id: 'self-healing-system',
      activity_type: 'fix_generated',
      content: `Generated remediation fix: ${rankedFix.title}\n\n` +
        `**Fix Category:** ${rankedFix.category}\n` +
        `**Ranking Score:** ${rankedFix.ranking_score}\n` +
        `**Applicability:** ${(rankedFix.applicability_score * 100).toFixed(0)}%\n` +
        `**Reason:** ${rankedFix.applicability_reason}\n\n` +
        `**Details:**\n` +
        `- Impact: ${rankedFix.metadata.impact}/10\n` +
        `- Confidence: ${(rankedFix.metadata.confidence * 100).toFixed(0)}%\n` +
        `- Effort: ${rankedFix.metadata.effort}/10\n` +
        `- Risk: ${rankedFix.metadata.risk}/10\n\n` +
        `**New Task:** [${createdTask.id}] ${createdTask.title}`,
      metadata: {
        fix_category: rankedFix.category,
        ranking_score: rankedFix.ranking_score,
        remediation_task_id: createdTask.id
      }
    };

    const activityResponse = await fetch(`http://localhost:3001/api/tasks/${issue.id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(activityData)
    });

    let activity = undefined;
    if (activityResponse.ok) {
      activity = await activityResponse.json();
    }

    return {
      success: true,
      task: createdTask,
      activity,
      dry_run: false
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      dry_run: false
    };
  }
}

/**
 * Record applied fix in database
 */
export async function recordAppliedFix(
  issue_id: string,
  fix_id: string,
  rankedFix: RankedFix,
  task_id: string,
  auto_applied: boolean
): Promise<void> {
  // This would interact with the self-healing database
  // For now, we'll use the Mission Control database via the task metadata
  // In a full implementation, this would insert into an `applied_fixes` table
  
  const appliedFixData = {
    id: uuidv4(),
    issue_id,
    fix_id,
    task_id,
    category: rankedFix.category,
    template_name: rankedFix.template_name,
    ranking_score: rankedFix.ranking_score,
    applicability_score: rankedFix.applicability_score,
    impact: rankedFix.metadata.impact,
    confidence: rankedFix.metadata.confidence,
    effort: rankedFix.metadata.effort,
    risk: rankedFix.metadata.risk,
    auto_applied,
    applied_at: Math.floor(Date.now() / 1000)
  };

  // In a production system, this would be saved to the applied_fixes table
  // For now, we log it as metadata on the issue
  console.log('Applied fix recorded:', appliedFixData);
}

/**
 * Batch create multiple remediation tasks
 */
export async function createMultipleRemediationTasks(
  issue: IssueContext,
  rankedFixes: RankedFix[],
  options: TaskCreationOptions = {}
): Promise<TaskCreationResult[]> {
  const results: TaskCreationResult[] = [];

  for (const fix of rankedFixes) {
    const result = await createRemediationTask(issue, fix, options);
    results.push(result);
  }

  return results;
}
