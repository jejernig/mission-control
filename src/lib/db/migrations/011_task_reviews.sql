-- Migration 011: Task Reviews System
-- Proper review workflow with audit trail

CREATE TABLE IF NOT EXISTS task_reviews (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    review_type TEXT NOT NULL CHECK(review_type IN ('uat', 'security', 'quality', 'gap', 'commit', 'pr')),
    reviewer_agent_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'passed', 'failed', 'skipped')),
    notes TEXT,
    started_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
    UNIQUE(task_id, review_type)
);

CREATE INDEX idx_task_reviews_task_id ON task_reviews(task_id);
CREATE INDEX idx_task_reviews_status ON task_reviews(status);
CREATE INDEX idx_task_reviews_type ON task_reviews(review_type);

-- Trigger to update updated_at
CREATE TRIGGER update_task_reviews_timestamp 
AFTER UPDATE ON task_reviews
BEGIN
    UPDATE task_reviews SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;
