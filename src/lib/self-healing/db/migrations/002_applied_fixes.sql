-- Migration: 002_applied_fixes
-- Description: Add applied_fixes table to track fix applications and their metadata
-- Created: 2026-02-06

-- ============================================================================
-- APPLIED_FIXES TABLE
-- Tracks fixes that have been applied to issues, including their scores and outcomes
-- ============================================================================
CREATE TABLE IF NOT EXISTS applied_fixes (
    id TEXT PRIMARY KEY,  -- UUID
    issue_id TEXT NOT NULL,
    fix_id TEXT NOT NULL,  -- Reference to fix template category/ID
    task_id TEXT NOT NULL,  -- Mission Control task that implements this fix
    category TEXT NOT NULL,  -- Fix category (verification_gate, clarification, reassignment, etc.)
    template_name TEXT NOT NULL,  -- Name of the template that generated this fix
    
    -- Ranking metadata
    ranking_score REAL NOT NULL,  -- Calculated score: (impact × confidence) / (effort × risk)
    applicability_score REAL NOT NULL,  -- How well the fix matched the issue (0-1)
    impact INTEGER NOT NULL CHECK(impact BETWEEN 1 AND 10),
    confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
    effort INTEGER NOT NULL CHECK(effort BETWEEN 1 AND 10),
    risk INTEGER NOT NULL CHECK(risk BETWEEN 1 AND 10),
    
    -- Application metadata
    auto_applied INTEGER NOT NULL CHECK(auto_applied IN (0, 1)),  -- Was this auto-applied?
    applied_at INTEGER NOT NULL,  -- Unix timestamp when fix was applied
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed', 'rolled_back')),
    completed_at INTEGER,  -- Unix timestamp when fix was completed
    
    -- Outcome tracking
    outcome TEXT,  -- 'success', 'failure', 'partial', etc.
    outcome_notes TEXT,  -- Details about the outcome
    
    -- Additional context
    metadata JSON,  -- Additional metadata about the fix application
    
    FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
);

CREATE INDEX idx_applied_fixes_issue ON applied_fixes(issue_id);
CREATE INDEX idx_applied_fixes_task ON applied_fixes(task_id);
CREATE INDEX idx_applied_fixes_category ON applied_fixes(category);
CREATE INDEX idx_applied_fixes_applied_at ON applied_fixes(applied_at);
CREATE INDEX idx_applied_fixes_auto_applied ON applied_fixes(auto_applied);
CREATE INDEX idx_applied_fixes_status ON applied_fixes(status);

-- Insert migration record
INSERT INTO schema_migrations (version, name, applied_at, checksum) 
VALUES ('002', 'applied_fixes', strftime('%s', 'now'), 'applied_fixes_v1');
