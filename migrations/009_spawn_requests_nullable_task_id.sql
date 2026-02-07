-- Make task_id nullable to support generic worker spawns
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table

-- Step 1: Create new table with nullable task_id
CREATE TABLE IF NOT EXISTS spawn_requests_new (
  id TEXT PRIMARY KEY,
  task_id TEXT, -- Made nullable
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

-- Step 2: Copy existing data
INSERT INTO spawn_requests_new 
SELECT * FROM spawn_requests;

-- Step 3: Drop old table
DROP TABLE spawn_requests;

-- Step 4: Rename new table
ALTER TABLE spawn_requests_new RENAME TO spawn_requests;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_spawn_requests_status ON spawn_requests(status);
CREATE INDEX IF NOT EXISTS idx_spawn_requests_task_id ON spawn_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_spawn_requests_created_at ON spawn_requests(created_at);
