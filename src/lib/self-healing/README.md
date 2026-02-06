# RCA Pattern Matching Engine

The Root Cause Analysis (RCA) Pattern Matching Engine analyzes detected issues and identifies potential root causes by matching against known failure patterns.

## Overview

The RCA engine is a core component of the self-healing pipeline that:

1. **Matches Issues Against Patterns** - Evaluates issue signals against a library of known failure patterns
2. **Calculates Confidence Scores** - Returns confidence levels for each matched pattern
3. **Recommends Actions** - Suggests remediation steps based on matched patterns
4. **Tracks Statistics** - Updates pattern match counts and success rates
5. **Handles Fallbacks** - Logs unmatched issues for future LLM or manual analysis

## Architecture

```
┌──────────────┐
│   Issue      │
│   Detected   │
└──────┬───────┘
       │
       v
┌──────────────────────────────┐
│   RCA Engine                 │
│   ┌────────────────────┐     │
│   │ Pattern Matching   │     │
│   │ - Condition Eval   │     │
│   │ - Confidence Calc  │     │
│   └────────────────────┘     │
└──────┬───────────────────────┘
       │
       v
┌──────────────────────────────┐
│   RCA Results                │
│   - Root Cause               │
│   - Confidence Score         │
│   - Recommended Actions      │
└──────────────────────────────┘
```

## Database Schema

### `failure_patterns` Table

Stores known failure patterns for root cause analysis.

**Key Fields:**
- `id` - Unique pattern identifier
- `name` - Pattern name
- `signal_type` - Type of signal (phantom, stuck_task, error, etc.)
- `conditions` - JSON conditions to evaluate
- `root_cause` - Identified root cause when pattern matches
- `recommended_action` - Suggested fix or mitigation
- `confidence_weight` - Weight applied to confidence calculation (0-1)
- `match_count` - Number of times pattern has matched
- `success_count` - Number of successful fixes
- `last_matched_at` - Last time pattern matched

### `rca_results` Table

Stores root cause analysis results for each analyzed issue.

**Key Fields:**
- `id` - Unique result identifier
- `issue_id` - Reference to the analyzed issue
- `pattern_id` - Matched pattern (null if no match)
- `root_cause` - Identified or inferred root cause
- `confidence` - Confidence score (0-1)
- `analysis_method` - How analysis was performed (pattern_match, llm, etc.)
- `matched_conditions` - Which conditions matched
- `recommended_actions` - Array of recommended actions
- `analyzed_at` - Analysis timestamp

## Pattern Condition Syntax

Patterns use JSON conditions that are evaluated against issue and task data:

```json
{
  "signal_contains": "phantom",
  "agent_role": { "not": "reviewer" },
  "deliverables_empty": true,
  "status": "in_progress",
  "agent_active_tasks": { "gt": 5 },
  "no_recent_activity": true,
  "days_since_activity": { "gte": 1 }
}
```

### Supported Condition Types

| Condition | Type | Example | Description |
|-----------|------|---------|-------------|
| `signal_contains` | string | `"phantom"` | Issue title/description contains text |
| `activity_contains` | string | `"blocked by"` | Activity log contains text |
| `status` | string | `"in_progress"` | Task status equals value |
| `agent_role` | object | `{"not": "reviewer"}` | Agent role matches condition |
| `agent_active_tasks` | object | `{"gt": 5}` | Number of active tasks comparison |
| `deliverables_empty` | boolean | `true` | No deliverables present |
| `no_recent_activity` | boolean | `true` | No activity in last 24h |
| `days_stale` | object | `{"gte": 2}` | Days since issue detected |
| `days_since_activity` | object | `{"gte": 1}` | Days since last activity |

### Comparison Operators

- `gt` - Greater than
- `gte` - Greater than or equal
- `lt` - Less than
- `lte` - Less than or equal
- `not` - Not equal
- `equals` - Equal
- `in` - In array

## Initial Patterns

The engine comes pre-configured with three patterns:

### 1. Phantom Implementation - Worker Confusion
**Signal:** `phantom`  
**Cause:** Agent reports task complete but no work was done  
**Action:** Reassign to reviewer; clarify scope

### 2. Stuck Task - Dependency Wait
**Signal:** `stuck_task`  
**Cause:** Task blocked by external dependency  
**Action:** Identify blocker; escalate or parallelize

### 3. Stuck Task - Agent Overload
**Signal:** `stuck_task`  
**Cause:** Agent has too many concurrent tasks  
**Action:** Redistribute tasks; prioritize critical work

## Usage

### Programmatic API

```typescript
import { rcaEngine } from '@/lib/self-healing/rca-engine';
import { getFailurePatterns } from '@/lib/self-healing/rca-db';
import type { Issue, RCAAnalysisInput } from '@/lib/self-healing/types';

// Prepare input
const input: RCAAnalysisInput = {
  issue: {
    id: 'issue-123',
    title: 'Task stuck with no activity',
    severity: 'high',
    status: 'detected',
    source: 'task-monitor',
    detected_at: Date.now(),
    updated_at: Date.now(),
  },
  task_data: {
    id: 'task-456',
    status: 'in_progress',
    agent_active_task_count: 8,
    last_activity_at: Date.now() - (2 * 24 * 60 * 60 * 1000), // 2 days ago
  },
};

// Get patterns from database
const db = new Database('self_healing.db');
const patterns = getFailurePatterns(db);

// Analyze
const analysis = await rcaEngine.analyzeIssue(input, patterns);

console.log('Best match:', analysis.best_match?.pattern.name);
console.log('Confidence:', analysis.best_match?.confidence);
console.log('Root cause:', analysis.best_match?.pattern.root_cause);
console.log('Actions:', analysis.best_match?.recommended_actions);
```

### REST API

#### Analyze an Issue

```bash
POST /api/self-healing/rca/analyze

{
  "issue": {
    "id": "issue-123",
    "title": "Task stuck with no activity",
    "severity": "high",
    "status": "detected",
    "source": "task-monitor",
    "detected_at": 1738876800000,
    "updated_at": 1738876800000
  },
  "task_data": {
    "id": "task-456",
    "status": "in_progress",
    "agent_active_task_count": 8,
    "last_activity_at": 1738790400000
  },
  "signal_type": "stuck_task"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "id": "rca-result-uuid",
    "issue_id": "issue-123",
    "pattern_id": "stuck-agent-overload",
    "root_cause": "Agent is overloaded with too many concurrent tasks",
    "confidence": 0.8,
    "recommended_actions": ["Redistribute tasks; reduce agent load"]
  },
  "analysis": {
    "patterns_evaluated": 3,
    "patterns_matched": 1,
    "analysis_time_ms": 5,
    "best_match": {
      "pattern_name": "Stuck Task - Agent Overload",
      "confidence": 0.8,
      "matched_conditions": {
        "agent_active_tasks": true,
        "no_recent_activity": true,
        "days_since_activity": true
      }
    }
  }
}
```

#### Get Statistics

```bash
GET /api/self-healing/rca/stats?include_unmatched=true&confidence_threshold=0.7
```

**Response:**
```json
{
  "patterns": {
    "total": 3,
    "active": 3,
    "statistics": [
      {
        "pattern_id": "phantom-worker-confusion",
        "name": "Phantom Implementation - Worker Confusion",
        "match_count": 15,
        "success_count": 12,
        "success_rate": 80.0
      }
    ]
  },
  "summary": {
    "total_matches": 42,
    "total_successes": 35,
    "average_success_rate": 83.3
  },
  "unmatched_issues": {
    "count": 5,
    "confidence_threshold": 0.7,
    "issues": [
      {
        "issue_id": "issue-789",
        "title": "Unknown error pattern",
        "source": "api-monitor"
      }
    ]
  }
}
```

## Performance Requirements

The RCA engine is designed for sub-second analysis:

- **Target:** < 100ms for pattern matching
- **Typical:** 5-15ms for 3-10 patterns
- **Maximum:** < 1000ms under load

## Testing

Run the test suite:

```bash
npm test -- src/lib/self-healing/__tests__/rca-engine.test.ts
```

Test coverage includes:
- Pattern matching accuracy (90%+ target)
- Confidence calculation
- Multiple pattern matching
- Inactive pattern filtering
- Performance benchmarks
- Edge cases and fallbacks

## Acceptance Criteria

- ✅ Pattern matching engine evaluates JSON conditions
- ✅ 90%+ of test issues match to correct pattern
- ✅ RCA results stored with confidence score
- ✅ Pattern statistics updated (last_matched_at, match_count)
- ✅ Unmatched issues logged for review
- ✅ Sub-second analysis time for pattern matching

## Future Enhancements

1. **LLM Fallback** - Use GPT-4 for unmatched issues
2. **Pattern Learning** - Auto-generate patterns from historical data
3. **Multi-Pattern Fixes** - Combine actions from multiple matched patterns
4. **Confidence Tuning** - Machine learning for confidence weights
5. **Real-time Updates** - WebSocket notifications for RCA results

## References

- Self-Healing Pipeline Specification (docs/Pipeline.md)
- Database Schema (src/lib/self-healing/db/schema.sql)
- RCA Types (src/lib/self-healing/types.ts)
- Pattern Matching Engine (src/lib/self-healing/rca-engine.ts)
