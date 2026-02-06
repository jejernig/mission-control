/**
 * Fix Generator - Main Orchestrator
 * 
 * Coordinates the fix generation workflow:
 * 1. Evaluate issue with all templates
 * 2. Rank applicable fixes
 * 3. Determine auto-apply eligibility
 * 4. Create remediation tasks
 * 5. Log activities
 */

import { IssueContext } from './fix-templates';
import { rankFixes, getBestAutoApplyFix, generateRankingSummary, shouldAutoApply, RankedFix } from './fix-ranking';
import { createRemediationTask, recordAppliedFix, TaskCreationOptions, TaskCreationResult } from './task-creator';

export interface FixGenerationOptions extends TaskCreationOptions {
  auto_apply?: boolean;           // Enable auto-application of fixes (default: true)
  max_fixes?: number;             // Maximum number of fixes to generate (default: 3)
  applicability_threshold?: number; // Minimum applicability score (default: 0.3)
}

export interface FixGenerationResult {
  issue_id: string;
  ranked_fixes: RankedFix[];
  auto_applied_fix?: RankedFix;
  created_tasks: TaskCreationResult[];
  summary: string;
  dry_run: boolean;
}

/**
 * Generate and optionally apply fixes for an issue
 */
export async function generateFixes(
  issue: IssueContext,
  options: FixGenerationOptions = {}
): Promise<FixGenerationResult> {
  const {
    auto_apply = true,
    max_fixes = 3,
    applicability_threshold = 0.3,
    dry_run = false,
    ...taskOptions
  } = options;

  // Step 1: Rank all applicable fixes
  const rankedFixes = rankFixes(issue, {
    top_n: max_fixes,
    applicability_threshold
  });

  // Step 2: Check for auto-apply candidate
  let auto_applied_fix: RankedFix | undefined;
  const created_tasks: TaskCreationResult[] = [];

  if (auto_apply && rankedFixes.length > 0) {
    const bestAutoFix = getBestAutoApplyFix(issue);
    
    if (bestAutoFix) {
      // Auto-apply the best fix
      const result = await createRemediationTask(issue, bestAutoFix, {
        ...taskOptions,
        dry_run,
        priority: 'high' // Auto-applied fixes get higher priority
      });

      if (result.success) {
        auto_applied_fix = bestAutoFix;
        created_tasks.push(result);

        // Record the applied fix
        if (!dry_run && result.task) {
          await recordAppliedFix(
            issue.id,
            bestAutoFix.category,
            bestAutoFix,
            result.task.id,
            true
          );
        }
      }
    }
  }

  // Step 3: Create tasks for other high-ranking fixes (that weren't auto-applied)
  const remainingFixes = rankedFixes.filter(fix => fix !== auto_applied_fix);
  
  for (const fix of remainingFixes) {
    const result = await createRemediationTask(issue, fix, {
      ...taskOptions,
      dry_run,
      priority: shouldAutoApply(fix) ? 'high' : 'normal'
    });

    if (result.success) {
      created_tasks.push(result);

      // Record the fix (not auto-applied)
      if (!dry_run && result.task) {
        await recordAppliedFix(
          issue.id,
          fix.category,
          fix,
          result.task.id,
          false
        );
      }
    }
  }

  // Step 4: Generate summary
  const summary = generateFixGenerationSummary(issue, rankedFixes, auto_applied_fix, created_tasks, dry_run);

  return {
    issue_id: issue.id,
    ranked_fixes: rankedFixes,
    auto_applied_fix,
    created_tasks,
    summary,
    dry_run
  };
}

/**
 * Generate a comprehensive summary of the fix generation process
 */
function generateFixGenerationSummary(
  issue: IssueContext,
  rankedFixes: RankedFix[],
  autoAppliedFix: RankedFix | undefined,
  createdTasks: TaskCreationResult[],
  dryRun: boolean
): string {
  const lines: string[] = [];

  lines.push(`# Fix Generation Summary ${dryRun ? '(DRY RUN)' : ''}`);
  lines.push('');
  lines.push(`**Issue:** ${issue.title}`);
  lines.push(`**Issue ID:** ${issue.id}`);
  lines.push(`**Severity:** ${issue.severity}`);
  lines.push('');

  if (rankedFixes.length === 0) {
    lines.push('❌ No applicable fixes found for this issue.');
    return lines.join('\n');
  }

  lines.push(`## Generated Fixes: ${rankedFixes.length}`);
  lines.push('');

  // Auto-applied fix section
  if (autoAppliedFix) {
    lines.push('### ✅ Auto-Applied Fix');
    lines.push(`**${autoAppliedFix.title}**`);
    lines.push(`- Category: ${autoAppliedFix.category}`);
    lines.push(`- Ranking Score: ${autoAppliedFix.ranking_score}`);
    lines.push(`- Confidence: ${(autoAppliedFix.metadata.confidence * 100).toFixed(0)}%`);
    lines.push(`- Risk Level: ${autoAppliedFix.metadata.risk}/10`);
    
    const autoTask = createdTasks.find(t => t.task?.title === autoAppliedFix.title);
    if (autoTask?.task) {
      lines.push(`- Task Created: ${autoTask.task.id}`);
    }
    lines.push('');
  }

  // Other fixes section
  const otherFixes = rankedFixes.filter(f => f !== autoAppliedFix);
  if (otherFixes.length > 0) {
    lines.push('### 📋 Additional Recommended Fixes');
    lines.push('');

    otherFixes.forEach((fix, index) => {
      lines.push(`**${index + 1}. ${fix.title}** (Score: ${fix.ranking_score})`);
      lines.push(`- Category: ${fix.category}`);
      lines.push(`- Applicability: ${(fix.applicability_score * 100).toFixed(0)}%`);
      lines.push(`- Risk: ${fix.metadata.risk}/10`);
      lines.push(`- Requires Approval: ${fix.requires_approval ? 'Yes' : 'No'}`);
      
      const task = createdTasks.find(t => t.task?.title === fix.title);
      if (task?.task) {
        lines.push(`- Task Created: ${task.task.id}`);
      }
      lines.push('');
    });
  }

  // Summary statistics
  lines.push('---');
  lines.push('');
  lines.push('### Statistics');
  lines.push(`- Total fixes evaluated: ${rankedFixes.length}`);
  lines.push(`- Auto-applied: ${autoAppliedFix ? '1' : '0'}`);
  lines.push(`- Tasks created: ${createdTasks.filter(t => t.success).length}`);
  lines.push(`- Mode: ${dryRun ? 'Dry Run (No actual changes)' : 'Live'}`);

  return lines.join('\n');
}

/**
 * Quick helper to generate and display fixes without creating tasks
 */
export async function analyzeFixes(
  issue: IssueContext,
  options?: Pick<FixGenerationOptions, 'max_fixes' | 'applicability_threshold'>
): Promise<string> {
  const result = await generateFixes(issue, {
    ...options,
    dry_run: true,
    auto_apply: true
  });

  return result.summary;
}
