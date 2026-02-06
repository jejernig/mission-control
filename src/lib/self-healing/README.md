# Self-Healing Fix Generation System

Automated fix generation and remediation task creation for Mission Control.

## Overview

This system implements an intelligent fix generation pipeline that:
1. Analyzes detected issues using fix templates
2. Ranks potential fixes by impact, confidence, effort, and risk
3. Automatically applies high-confidence, low-risk fixes
4. Creates remediation tasks in Mission Control
5. Logs activities and tracks applied fixes

## Architecture

```
Issue → Fix Templates → Ranking → Auto-Apply Decision → Task Creation → Activity Logging
```

### Components

#### 1. Fix Templates (`fix-templates/`)
Modular templates that evaluate applicability and generate fixes.

**Available Templates:**
- **Verification Gate** - Adds commit verification to prevent quality issues
- **Clarification** - Updates task descriptions with missing requirements
- **Reassignment** - Routes tasks to less busy or better-skilled agents

#### 2. Fix Ranking (`fix-ranking.ts`)
Scores and ranks fixes using the formula:
```
score = (impact × confidence) / (effort × risk)
```

#### 3. Auto-Apply Logic (`fix-ranking.ts`)
Determines if a fix should be auto-applied based on:
- Ranking score > 8
- Risk ≤ 3
- Confidence ≥ 0.8
- Category in ['clarification', 'verification_gate']

#### 4. Task Creator (`task-creator.ts`)
Integrates with Mission Control API to:
- Create remediation tasks (POST /api/tasks)
- Log activities to original issue (POST /api/tasks/:id/activities)
- Record applied fixes in database

#### 5. Orchestrator (`fix-generator.ts`)
Coordinates the entire workflow.

## Installation

The system is built into Mission Control. No separate installation required.

## Usage

### Programmatic API

```typescript
import { generateFixes, IssueContext } from '@/lib/self-healing';

const issue: IssueContext = {
  id: 'issue-123',
  title: 'Task specification is unclear',
  description: 'Requirements are ambiguous and need clarification',
  severity: 'medium',
  source: 'task-management'
};

// Generate and optionally apply fixes
const result = await generateFixes(issue, {
  dry_run: false,      // Set to true for testing
  auto_apply: true,    // Enable auto-application
  max_fixes: 3         // Return top 3 fixes
});

console.log(result.summary);
console.log('Tasks created:', result.created_tasks.length);
```

### CLI Tool

```bash
# Analyze fixes without creating tasks
tsx src/lib/self-healing/cli.ts analyze

# Generate fixes (dry run)
tsx src/lib/self-healing/cli.ts generate --dry-run

# Generate and create tasks (live)
tsx src/lib/self-healing/cli.ts generate

# Show example issue JSON
tsx src/lib/self-healing/cli.ts example

# Use custom issue
tsx src/lib/self-healing/cli.ts generate '{"id":"123","title":"Issue",...}'
```

### API Integration

The system can be integrated into Mission Control's issue detection pipeline:

```typescript
// When an issue is detected
const detectedIssue = await detectIssue();

// Generate fixes automatically
const fixResult = await generateFixes(detectedIssue, {
  auto_apply: true,
  assigned_agent_id: 'agent-123',
  workspace_id: 'workspace-456'
});

// Fixes are now applied and tasks created
```

## Fix Templates

### Creating Custom Templates

Extend the `FixTemplate` base class:

```typescript
import { FixTemplate, IssueContext, GeneratedFix, ApplicabilityScore } from './base';

export class MyCustomTemplate extends FixTemplate {
  readonly name = 'My Custom Fix';
  readonly category = 'custom_fix';
  readonly description = 'Fixes custom issues';

  calculateApplicability(issue: IssueContext): ApplicabilityScore {
    let score = 0;
    const reasons: string[] = [];
    
    // Evaluate issue relevance
    if (issue.title.includes('custom')) {
      score += 0.5;
      reasons.push('Custom keyword found');
    }
    
    return { score, reason: reasons.join('; ') };
  }

  generateFix(issue: IssueContext): GeneratedFix {
    return {
      category: this.category,
      title: 'Fix for ' + issue.title,
      description: 'Detailed fix description...',
      action_data: {
        type: 'custom_action',
        // ... action details
      },
      metadata: {
        impact: 7,
        confidence: 0.85,
        effort: 3,
        risk: 2
      },
      requires_approval: false
    };
  }
}
```

Register in `fix-templates/index.ts`:

```typescript
import { MyCustomTemplate } from './my-custom';

export const FIX_TEMPLATES: FixTemplate[] = [
  // ... existing templates
  new MyCustomTemplate()
];
```

## Configuration

### Auto-Apply Criteria

Modify in `fix-ranking.ts`:

```typescript
export function shouldAutoApply(rankedFix: RankedFix): boolean {
  // Customize criteria here
  return (
    rankedFix.ranking_score > 8 &&
    rankedFix.metadata.risk <= 3 &&
    rankedFix.metadata.confidence >= 0.8 &&
    ['clarification', 'verification_gate'].includes(rankedFix.category)
  );
}
```

### Ranking Algorithm

The ranking formula can be adjusted in `calculateRankingScore()`:

```typescript
// Current: (impact × confidence) / (effort × risk)
const score = (impact * confidence) / Math.max(effort * risk, 0.1);

// Alternative: Add priority weighting
const score = ((impact * 2) * confidence) / (effort * risk);
```

## Testing

### Run Tests

```bash
npm test src/lib/self-healing/__tests__/
```

### Test Coverage

The test suite covers:
- ✅ Fix template applicability scoring
- ✅ Fix generation for each template
- ✅ Ranking score calculation
- ✅ Auto-apply decision logic
- ✅ Edge cases (division by zero, invalid data)
- ✅ Integration between components

## Database Schema

### `applied_fixes` Table

Tracks all applied fixes with metadata:

```sql
CREATE TABLE applied_fixes (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL,
    fix_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    category TEXT NOT NULL,
    template_name TEXT NOT NULL,
    
    -- Ranking metadata
    ranking_score REAL NOT NULL,
    applicability_score REAL NOT NULL,
    impact INTEGER NOT NULL,
    confidence REAL NOT NULL,
    effort INTEGER NOT NULL,
    risk INTEGER NOT NULL,
    
    -- Application tracking
    auto_applied INTEGER NOT NULL,
    applied_at INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    completed_at INTEGER,
    
    -- Outcome
    outcome TEXT,
    outcome_notes TEXT,
    metadata JSON
);
```

## API Endpoints

### POST /api/tasks
Creates a new remediation task.

**Request:**
```json
{
  "title": "Fix Title",
  "description": "Fix description",
  "status": "inbox",
  "priority": "high",
  "metadata": {
    "source": "self-healing",
    "issue_id": "issue-123",
    "fix_category": "clarification"
  }
}
```

### POST /api/tasks/:id/activities
Logs an activity on a task.

**Request:**
```json
{
  "agent_id": "self-healing-system",
  "activity_type": "fix_generated",
  "content": "Generated fix: ...",
  "metadata": {
    "fix_category": "clarification",
    "ranking_score": 9.5
  }
}
```

## Examples

### Example 1: Clarification Fix

**Input Issue:**
```typescript
{
  id: 'issue-001',
  title: 'Task requirements unclear',
  description: 'What exactly needs to be implemented?',
  severity: 'medium',
  source: 'task-management'
}
```

**Generated Fix:**
- Category: `clarification`
- Ranking Score: ~11.34 (high)
- Auto-Apply: Yes (score > 8, risk = 1, confidence = 0.9)
- Action: Update task description with requirements

### Example 2: Verification Gate

**Input Issue:**
```typescript
{
  id: 'issue-002',
  title: 'Untested code pushed to production',
  description: 'Code was deployed without proper testing',
  severity: 'high',
  source: 'pipeline'
}
```

**Generated Fix:**
- Category: `verification_gate`
- Ranking Score: ~8.5
- Auto-Apply: Yes
- Action: Add verification gate before commit stage

### Example 3: Reassignment

**Input Issue:**
```typescript
{
  id: 'issue-003',
  title: 'Agent timeout - task stuck',
  description: 'Current agent is overloaded and not responding',
  severity: 'high',
  source: 'agent-monitoring',
  metadata: { agent_overloaded: true }
}
```

**Generated Fix:**
- Category: `reassignment`
- Ranking Score: ~5.0
- Auto-Apply: No (requires approval)
- Action: Reassign to available agent

## Monitoring

### Success Metrics

Track in `system_health` table:
- Total fixes generated
- Auto-apply rate
- Fix success rate
- Average resolution time
- Fix category distribution

### Sample Query

```sql
SELECT 
  category,
  COUNT(*) as total_applied,
  SUM(CASE WHEN auto_applied = 1 THEN 1 ELSE 0 END) as auto_applied_count,
  AVG(ranking_score) as avg_score,
  AVG(completed_at - applied_at) as avg_completion_time
FROM applied_fixes
WHERE applied_at > strftime('%s', 'now', '-7 days')
GROUP BY category;
```

## Roadmap

- [ ] Machine learning-based pattern matching
- [ ] Historical fix success rate tracking
- [ ] Automatic template tuning based on outcomes
- [ ] Multi-issue fix bundling
- [ ] Integration with external issue trackers
- [ ] Slack/Discord notifications for applied fixes
- [ ] Web UI for fix management

## Contributing

To add new fix templates:
1. Create template class in `fix-templates/`
2. Implement `calculateApplicability()` and `generateFix()`
3. Add to `FIX_TEMPLATES` array in `index.ts`
4. Write tests in `__tests__/`
5. Update this README

## License

Part of Mission Control - see root LICENSE file.
