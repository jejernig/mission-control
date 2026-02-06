-- RCA (Root Cause Analysis) Pattern Matching Tables
-- Version: 002
-- Created: 2026-02-06

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ============================================================================
-- FAILURE_PATTERNS TABLE
-- Stores known failure patterns for root cause analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS failure_patterns (
    id TEXT PRIMARY KEY,  -- UUID
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    signal_type TEXT NOT NULL,  -- Type of signal to match (phantom, stuck_task, error, etc.)
    conditions JSON NOT NULL,  -- JSON conditions to evaluate for pattern match
    root_cause TEXT NOT NULL,  -- Identified root cause when pattern matches
    recommended_action TEXT,  -- Suggested fix or mitigation
    confidence_weight REAL DEFAULT 1.0 CHECK(confidence_weight BETWEEN 0 AND 1),
    severity TEXT CHECK(severity IN ('critical', 'high', 'medium', 'low', 'info')),
    match_count INTEGER DEFAULT 0,  -- Number of times this pattern has matched
    success_count INTEGER DEFAULT 0,  -- Number of times fix was successful
    is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at INTEGER NOT NULL,  -- Unix timestamp
    updated_at INTEGER NOT NULL,  -- Unix timestamp
    last_matched_at INTEGER  -- Unix timestamp
);

CREATE INDEX idx_failure_patterns_signal_type ON failure_patterns(signal_type);
CREATE INDEX idx_failure_patterns_active ON failure_patterns(is_active);
CREATE INDEX idx_failure_patterns_severity ON failure_patterns(severity);

-- ============================================================================
-- RCA_RESULTS TABLE
-- Stores root cause analysis results for detected issues
-- ============================================================================
CREATE TABLE IF NOT EXISTS rca_results (
    id TEXT PRIMARY KEY,  -- UUID
    issue_id TEXT NOT NULL,  -- Reference to the issue being analyzed
    pattern_id TEXT,  -- Matched pattern (null if no match)
    root_cause TEXT NOT NULL,  -- Identified or inferred root cause
    confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),  -- Confidence score
    analysis_method TEXT NOT NULL CHECK(analysis_method IN ('pattern_match', 'llm', 'heuristic', 'manual')),
    matched_conditions JSON,  -- Which conditions matched (for pattern matches)
    recommended_actions JSON,  -- Array of recommended actions
    metadata JSON,  -- Additional analysis context
    analyzed_at INTEGER NOT NULL,  -- Unix timestamp
    analyst_agent TEXT,  -- Agent that performed analysis (e.g., 'rca-engine', 'gpt-4')
    FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
    FOREIGN KEY (pattern_id) REFERENCES failure_patterns(id) ON DELETE SET NULL
);

CREATE INDEX idx_rca_results_issue ON rca_results(issue_id);
CREATE INDEX idx_rca_results_pattern ON rca_results(pattern_id);
CREATE INDEX idx_rca_results_analyzed_at ON rca_results(analyzed_at);
CREATE INDEX idx_rca_results_confidence ON rca_results(confidence);

-- ============================================================================
-- SEED INITIAL FAILURE PATTERNS
-- Based on task requirements
-- ============================================================================

-- Pattern 1: Phantom Implementation - Worker Confusion
INSERT INTO failure_patterns (
    id,
    name,
    description,
    signal_type,
    conditions,
    root_cause,
    recommended_action,
    confidence_weight,
    severity,
    created_at,
    updated_at
) VALUES (
    'phantom-worker-confusion',
    'Phantom Implementation - Worker Confusion',
    'Agent reports task as complete but no actual work was done, typically when non-reviewer agent works on phantom tasks',
    'phantom',
    json('{"signal_contains": "phantom", "agent_role": {"not": "reviewer"}, "deliverables_empty": true}'),
    'Agent misunderstood task scope or assignment - worked on phantom/non-existent task',
    'Reassign to appropriate reviewer agent; clarify task scope and acceptance criteria',
    0.9,
    'high',
    strftime('%s', 'now'),
    strftime('%s', 'now')
);

-- Pattern 2: Stuck Task - Dependency Wait
INSERT INTO failure_patterns (
    id,
    name,
    description,
    signal_type,
    conditions,
    root_cause,
    recommended_action,
    confidence_weight,
    severity,
    created_at,
    updated_at
) VALUES (
    'stuck-dependency-wait',
    'Stuck Task - Dependency Wait',
    'Task is blocked waiting for external dependency or another task to complete',
    'stuck_task',
    json('{"activity_contains": "blocked by", "status": "in_progress", "days_stale": {"gte": 2}}'),
    'Task is blocked by external dependency or upstream task',
    'Identify blocking dependency; escalate or parallelize work; update task dependencies',
    0.85,
    'medium',
    strftime('%s', 'now'),
    strftime('%s', 'now')
);

-- Pattern 3: Stuck Task - Agent Overload
INSERT INTO failure_patterns (
    id,
    name,
    description,
    signal_type,
    conditions,
    root_cause,
    recommended_action,
    confidence_weight,
    severity,
    created_at,
    updated_at
) VALUES (
    'stuck-agent-overload',
    'Stuck Task - Agent Overload',
    'Agent is assigned too many concurrent tasks and making no progress',
    'stuck_task',
    json('{"agent_active_tasks": {"gt": 5}, "no_recent_activity": true, "days_since_activity": {"gte": 1}}'),
    'Agent is overloaded with too many concurrent tasks',
    'Redistribute tasks; reduce agent load; prioritize critical tasks',
    0.8,
    'high',
    strftime('%s', 'now'),
    strftime('%s', 'now')
);

-- Update schema migrations table
INSERT INTO schema_migrations (version, name, applied_at, checksum) 
VALUES ('002', 'rca_tables', strftime('%s', 'now'), 'rca_v1');
