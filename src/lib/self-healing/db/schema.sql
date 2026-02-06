-- Self-Healing Pipeline Database Schema
-- Version: 1.0.0
-- Created: 2026-02-05

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ============================================================================
-- ISSUES TABLE
-- Tracks all detected issues in the system
-- ============================================================================
CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,  -- UUID
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL CHECK(severity IN ('critical', 'high', 'medium', 'low', 'info')),
    status TEXT NOT NULL DEFAULT 'detected' CHECK(status IN ('detected', 'analyzing', 'fixing', 'fixed', 'failed', 'ignored')),
    source TEXT NOT NULL,  -- Component/service where issue was detected
    error_type TEXT,  -- Classification: timeout, connection, memory, etc.
    error_message TEXT,
    stack_trace TEXT,
    metadata JSON,  -- Additional context as JSON
    detected_at INTEGER NOT NULL,  -- Unix timestamp
    updated_at INTEGER NOT NULL,  -- Unix timestamp
    resolved_at INTEGER,  -- Unix timestamp
    pattern_id TEXT,  -- Reference to matched pattern (if any)
    fix_id TEXT,  -- Reference to applied fix (if any)
    FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE SET NULL,
    FOREIGN KEY (fix_id) REFERENCES fixes(id) ON DELETE SET NULL
);

CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_severity ON issues(severity);
CREATE INDEX idx_issues_source ON issues(source);
CREATE INDEX idx_issues_detected_at ON issues(detected_at);
CREATE INDEX idx_issues_pattern_id ON issues(pattern_id);

-- ============================================================================
-- PATTERNS TABLE
-- Stores learned patterns for issue recognition and classification
-- ============================================================================
CREATE TABLE IF NOT EXISTS patterns (
    id TEXT PRIMARY KEY,  -- UUID
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    pattern_type TEXT NOT NULL CHECK(pattern_type IN ('regex', 'signature', 'ml_model', 'heuristic')),
    pattern_data JSON NOT NULL,  -- Pattern definition (regex, signatures, model params, etc.)
    confidence_threshold REAL DEFAULT 0.8 CHECK(confidence_threshold BETWEEN 0 AND 1),
    severity TEXT CHECK(severity IN ('critical', 'high', 'medium', 'low', 'info')),
    tags JSON,  -- Array of tags for categorization
    match_count INTEGER DEFAULT 0,  -- Number of times pattern has matched
    success_rate REAL DEFAULT 0.0,  -- Percentage of successful fixes when pattern matched
    is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at INTEGER NOT NULL,  -- Unix timestamp
    updated_at INTEGER NOT NULL,  -- Unix timestamp
    last_matched_at INTEGER  -- Unix timestamp
);

CREATE INDEX idx_patterns_type ON patterns(pattern_type);
CREATE INDEX idx_patterns_active ON patterns(is_active);
CREATE INDEX idx_patterns_severity ON patterns(severity);

-- ============================================================================
-- FIXES TABLE
-- Stores fix strategies and their execution history
-- ============================================================================
CREATE TABLE IF NOT EXISTS fixes (
    id TEXT PRIMARY KEY,  -- UUID
    name TEXT NOT NULL,
    description TEXT,
    fix_type TEXT NOT NULL CHECK(fix_type IN ('restart', 'config_change', 'script', 'rollback', 'scale', 'manual', 'custom')),
    pattern_id TEXT,  -- Pattern this fix is designed for (optional)
    action_data JSON NOT NULL,  -- Fix execution details (commands, scripts, configs, etc.)
    prerequisites JSON,  -- Conditions that must be met before applying
    rollback_data JSON,  -- How to revert this fix if needed
    risk_level TEXT DEFAULT 'medium' CHECK(risk_level IN ('critical', 'high', 'medium', 'low')),
    max_retries INTEGER DEFAULT 3,
    timeout_seconds INTEGER DEFAULT 300,
    requires_approval INTEGER DEFAULT 0 CHECK(requires_approval IN (0, 1)),
    is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at INTEGER NOT NULL,  -- Unix timestamp
    updated_at INTEGER NOT NULL,  -- Unix timestamp
    FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE SET NULL
);

CREATE INDEX idx_fixes_type ON fixes(fix_type);
CREATE INDEX idx_fixes_pattern ON fixes(pattern_id);
CREATE INDEX idx_fixes_active ON fixes(is_active);

-- ============================================================================
-- FIX_EXECUTIONS TABLE
-- Tracks individual fix execution attempts
-- ============================================================================
CREATE TABLE IF NOT EXISTS fix_executions (
    id TEXT PRIMARY KEY,  -- UUID
    issue_id TEXT NOT NULL,
    fix_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'success', 'failed', 'rolled_back', 'cancelled')),
    attempt_number INTEGER DEFAULT 1,
    started_at INTEGER NOT NULL,  -- Unix timestamp
    completed_at INTEGER,  -- Unix timestamp
    duration_ms INTEGER,  -- Execution duration in milliseconds
    output TEXT,  -- Execution output/logs
    error_message TEXT,
    metadata JSON,
    FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
    FOREIGN KEY (fix_id) REFERENCES fixes(id) ON DELETE CASCADE
);

CREATE INDEX idx_fix_executions_issue ON fix_executions(issue_id);
CREATE INDEX idx_fix_executions_fix ON fix_executions(fix_id);
CREATE INDEX idx_fix_executions_status ON fix_executions(status);
CREATE INDEX idx_fix_executions_started ON fix_executions(started_at);

-- ============================================================================
-- METRICS TABLE
-- Stores performance and health metrics for the self-healing system
-- ============================================================================
CREATE TABLE IF NOT EXISTS metrics (
    id TEXT PRIMARY KEY,  -- UUID
    metric_type TEXT NOT NULL,  -- Type of metric (system, performance, business, etc.)
    metric_name TEXT NOT NULL,  -- Name of the metric
    metric_value REAL NOT NULL,  -- Numeric value
    unit TEXT,  -- Unit of measurement (ms, %, count, etc.)
    source TEXT,  -- Where metric was collected from
    tags JSON,  -- Additional categorization
    timestamp INTEGER NOT NULL,  -- Unix timestamp
    metadata JSON
);

CREATE INDEX idx_metrics_type ON metrics(metric_type);
CREATE INDEX idx_metrics_name ON metrics(metric_name);
CREATE INDEX idx_metrics_timestamp ON metrics(timestamp);
CREATE INDEX idx_metrics_source ON metrics(source);

-- ============================================================================
-- SYSTEM_HEALTH TABLE
-- Tracks overall system health snapshots
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_health (
    id TEXT PRIMARY KEY,  -- UUID
    health_score REAL NOT NULL CHECK(health_score BETWEEN 0 AND 100),
    status TEXT NOT NULL CHECK(status IN ('healthy', 'degraded', 'critical', 'unknown')),
    active_issues INTEGER DEFAULT 0,
    resolved_issues_24h INTEGER DEFAULT 0,
    failed_fixes_24h INTEGER DEFAULT 0,
    average_resolution_time_ms INTEGER,
    details JSON,  -- Detailed health breakdown
    timestamp INTEGER NOT NULL  -- Unix timestamp
);

CREATE INDEX idx_system_health_timestamp ON system_health(timestamp);
CREATE INDEX idx_system_health_status ON system_health(status);

-- ============================================================================
-- SCHEMA_MIGRATIONS TABLE
-- Tracks applied database migrations
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL,  -- Unix timestamp
    checksum TEXT
);

-- Insert initial schema version
INSERT OR IGNORE INTO schema_migrations (version, name, applied_at, checksum) 
VALUES ('001', 'initial_schema', strftime('%s', 'now'), 'initial');
