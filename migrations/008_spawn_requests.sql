-- Spawn Requests Table
-- Stores requests for Jarvis to spawn architect agents

CREATE TABLE IF NOT EXISTS spawn_requests (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_title TEXT NOT NULL,
  task_description TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  session_key TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spawn_requests_status ON spawn_requests(status);
CREATE INDEX IF NOT EXISTS idx_spawn_requests_task_id ON spawn_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_spawn_requests_created_at ON spawn_requests(created_at);
