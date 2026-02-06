import { v4 as uuidv4 } from 'uuid';
import { RankedFix } from './fix-ranking';
import { IssueContext } from './fix-templates';

export interface TaskCreationOptions {
  dry_run?: boolean;
  assigned_agent_id?: string;
  workspace_id?: string;
  business_id?: string;
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
        task_id: issue.id,
        agent_id: 'self-healing-system',
        activity_type: 'fix_generated',
        content: `[DRY RUN] Generated fix: ${rankedFix.title} (Score: ${rankedFix.ranking_score})`,
        created_at: new Date().toISOString()
      },
      dry_run: true
    };
  }

  try {
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

    const activityData = {
      agent_id: 'self-healing-system',
      activity_type: 'fix_generated',
      content: `Generated remediation fix: ${rankedFix.title}\n\n` +
        `**Fix Category:** ${rankedFix.category}\n` +
        `**Ranking Score:** ${rankedFix.ranking_score}\n` +
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

export async function recordAppliedFix(
  issue_id: string,
  fix_id: string,
  rankedFix: RankedFix,
  task_id: string,
  auto_applied: boolean
): Promise<void> {
  console.log('Applied fix recorded:', { issue_id, fix_id, task_id, auto_applied });
}
