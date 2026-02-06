#!/usr/bin/env node
/**
 * Self-Healing Fix Generation CLI
 * 
 * Command-line tool for testing and running the fix generation system.
 * 
 * Usage:
 *   tsx src/lib/self-healing/cli.ts analyze <issue-json>
 *   tsx src/lib/self-healing/cli.ts generate <issue-json> [--dry-run] [--no-auto-apply]
 */

import type { IssueContext } from './fix-templates/base';
import { generateFixes, analyzeFixes } from './fix-generator';

// Mock issue for testing
const EXAMPLE_ISSUE: IssueContext = {
  id: 'test-issue-001',
  title: 'Task specification is unclear and missing acceptance criteria',
  description: 'The task description lacks clear requirements. What should be implemented? How do we know when it\'s done? The specification is too vague and needs clarification.',
  severity: 'medium',
  source: 'task-management',
  error_type: 'specification',
  metadata: {
    incomplete_spec: true,
    needs_clarification: true
  }
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
Self-Healing Fix Generation CLI

Usage:
  tsx src/lib/self-healing/cli.ts analyze [issue-json]
  tsx src/lib/self-healing/cli.ts generate [issue-json] [--dry-run] [--no-auto-apply]
  tsx src/lib/self-healing/cli.ts example

Commands:
  analyze     Analyze and rank fixes without creating tasks
  generate    Generate and create remediation tasks
  example     Show example issue JSON

Options:
  --dry-run         Don't actually create tasks (default for analyze)
  --no-auto-apply   Disable auto-application of fixes

Example:
  tsx src/lib/self-healing/cli.ts analyze
  tsx src/lib/self-healing/cli.ts generate --dry-run
    `);
    process.exit(0);
  }

  // Parse issue from args or use example
  let issue: IssueContext;
  const issueArg = args[1];
  
  if (issueArg && issueArg !== '--dry-run' && issueArg !== '--no-auto-apply') {
    try {
      issue = JSON.parse(issueArg);
    } catch (error) {
      console.error('Error: Invalid JSON for issue');
      process.exit(1);
    }
  } else {
    console.log('Using example issue (pass JSON as argument to use custom issue)\n');
    issue = EXAMPLE_ISSUE;
  }

  // Parse options
  const dryRun = args.includes('--dry-run');
  const autoApply = !args.includes('--no-auto-apply');

  try {
    switch (command) {
      case 'example':
        console.log('Example issue JSON:\n');
        console.log(JSON.stringify(EXAMPLE_ISSUE, null, 2));
        break;

      case 'analyze':
        console.log('🔍 Analyzing fixes for issue...\n');
        console.log(`Issue: ${issue.title}\n`);
        
        const analysis = await analyzeFixes(issue);
        console.log(analysis);
        break;

      case 'generate':
        console.log(`🔧 Generating fixes for issue... ${dryRun ? '(DRY RUN)' : ''}\n`);
        console.log(`Issue: ${issue.title}\n`);
        
        const result = await generateFixes(issue, {
          dry_run: dryRun,
          auto_apply: autoApply
        });
        
        console.log(result.summary);
        
        if (result.created_tasks.length > 0) {
          console.log('\n📋 Created Tasks:\n');
          result.created_tasks.forEach((task, i) => {
            if (task.success && task.task) {
              console.log(`${i + 1}. ${task.task.title}`);
              console.log(`   ID: ${task.task.id}`);
              console.log(`   Priority: ${task.task.priority}`);
              console.log(`   Status: ${task.task.status}`);
              console.log('');
            }
          });
        }
        break;

      default:
        console.error(`Error: Unknown command '${command}'`);
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
