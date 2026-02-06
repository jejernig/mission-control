-- Migration: 001_initial_schema
-- Description: Create initial tables for self-healing pipeline
-- Created: 2026-02-05

-- This migration creates the foundational schema for the self-healing system
-- including tables for issues, patterns, fixes, metrics, and system health

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Import the full schema
-- (In production, this would be the actual table definitions)
-- For now, reference schema.sql as the source of truth

BEGIN TRANSACTION;

-- Issues table
CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL CHECK(severity IN ('critical', 'high', 'medium', 'low', 'info')),
    status TEXT NOT NULL DEFAULT 'detected' CHECK(status IN ('detected', 'analyzing', 'fixing', 'fixed', 'failed', 'ignored')),
    source TEXT NOT NULL,
    error_type TEXT,
    error_message TEXT,
    stack_trace TEXT,
    metadata JSON,
    detected_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    resolved_at INTEGER,
    pattern_id TEXT,
    fix_id TEXT,
    FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE SET NULL,
    FOREIGN KEY (fix_id) REFERENCES fixes(id) ON DELETE SET NULL
);

CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_severity ON issues(severity);
CREATE INDEX idx_issues_source ON issues(source);
CREATE INDEX idx_issues_detected_at ON issues(detected_at);
CREATE INDEX idx_issues_pattern_id ON issues(pattern_id);

-- Patterns table
CREATE TABLE IF NOT EXISTS patterns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    pattern_type TEXT NOT NULL CHECK(pattern_type IN ('regex', 'signature', 'ml_model', 'heuristic')),
    pattern_data JSON NOT NULL,
    confidence_threshold REAL DEFAULT 0.8 CHECK(confidence_threshold BETWEEN 0 AND 1),
    severity TEXT CHECK(severity IN ('critical', 'high', 'medium', 'low', 'info')),
    tags JSON,
    match_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0.0,
    is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_matched_at INTEGER
);

CREATE INDEX idx_patterns_type ON patterns(pattern_type);
CREATE INDEX idx_patterns_active ON patterns(is_active);
CREATE INDEX idx_patterns_severity ON patterns(severity);

-- Fixes table
CREATE TABLE IF NOT EXISTS fixes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    fix_type TEXT NOT NULL CHECK(fix_type IN ('restart', 'config_change', 'script', 'rollback', 'scale', 'manual', 'custom')),
    pattern_id TEXT,
    action_data JSON NOT NULL,
    prerequisites JSON,
    rollback_data JSON,
    risk_level TEXT DEFAULT 'medium' CHECK(risk_level IN ('critical', 'high', 'medium', 'low')),
    max_retries INTEGER DEFAULT 3,
    timeout_seconds INTEGER DEFAULT 300,
    requires_approval INTEGER DEFAULT 0 CHECK(requires_approval IN (0, 1)),
    is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE SET NULL
);

CREATE INDEX idx_fixes_type ON fixes(fix_type);
CREATE INDEX idx_fixes_pattern ON fixes(pattern_id);
CREATE INDEX idx_fixes_active ON fixes(is_active);

-- Fix executions table
CREATE TABLE IF NOT EXISTS fix_executions (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL,
    fix_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'success', 'failed', 'rolled_back', 'cancelled')),
    attempt_number INTEGER DEFAULT 1,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    duration_ms INTEGER,
    output TEXT,
    error_message TEXT,
    metadata JSON,
    FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
    FOREIGN KEY (fix_id) REFERENCES fixes(id) ON DELETE CASCADE
);

CREATE INDEX idx_fix_executions_issue ON fix_executions(issue_id);
CREATE INDEX idx_fix_executions_fix ON fix_executions(fix_id);
CREATE INDEX idx_fix_executions_status ON fix_executions(status);
CREATE INDEX idx_fix_executions_started ON fix_executions(started_at);

-- Metrics table
CREATE TABLE IF NOT EXISTS metrics (
    id TEXT PRIMARY KEY,
    metric_type TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    unit TEXT,
    source TEXT,
    tags JSON,
    timestamp INTEGER NOT NULL,
    metadata JSON
);

CREATE INDEX idx_metrics_type ON metrics(metric_type);
CREATE INDEX idx_metrics_name ON metrics(metric_name);
CREATE INDEX idx_metrics_timestamp ON metrics(timestamp);
CREATE INDEX idx_metrics_source ON metrics(source);

-- System health table
CREATE TABLE IF NOT EXISTS system_health (
    id TEXT PRIMARY KEY,
    health_score REAL NOT NULL CHECK(health_score BETWEEN 0 AND 100),
    status TEXT NOT NULL CHECK(status IN ('healthy', 'degraded', 'critical', 'unknown')),
    active_issues INTEGER DEFAULT 0,
    resolved_issues_24h INTEGER DEFAULT 0,
    failed_fixes_24h INTEGER DEFAULT 0,
    average_resolution_time_ms INTEGER,
    details JSON,
    timestamp INTEGER NOT NULL
);

CREATE INDEX idx_system_health_timestamp ON system_health(timestamp);
CREATE INDEX idx_system_health_status ON system_health(status);

-- Schema migrations table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL,
    checksum TEXT
);

-- Record this migration
INSERT INTO schema_migrations (version, name, applied_at, checksum) 
VALUES ('001', 'initial_schema', strftime('%s', 'now'), 'sha256:001_initial');

COMMIT;
