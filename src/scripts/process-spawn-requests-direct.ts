#!/usr/bin/env tsx
/**
 * Process Spawn Requests (Direct Database Access)
 * 
 * This version directly accesses the SQLite database instead of going through
 * the API, which avoids issues with the Mission Control server.
 * 
 * Architecture:
 *   1. Script queries database directly for pending requests
 *   2. Writes them to /tmp/mission-control-spawn-queue.json
 *   3. Jarvis heartbeat reads queue file
 *   4. Jarvis spawns sessions and writes results to /tmp/mission-control-spawn-results.json
 *   5. Script reads results and updates database directly
 */

import fs from 'fs';
import Database from 'better-sqlite3';

const DB_PATH = `${process.env.HOME}/source/mission-control/mission-control.db`;
const QUEUE_FILE = '/tmp/mission-control-spawn-queue.json';
const RESULTS_FILE = '/tmp/mission-control-spawn-results.json';
const MAX_REQUESTS_PER_CYCLE = 5;

interface SpawnRequest {
  id: string;
  task_id: string | null;
  task_title: string;
  task_description: string | null;
  status: string;
  created_at: string;
}

interface SpawnResult {
  requestId: string;
  status: 'completed' | 'failed';
  sessionKey?: string;
  error?: string;
}

interface QueueEntry {
  requestId: string;
  taskTitle: string;
  taskDescription: string | null;
  taskId: string | null;
  isArchitect: boolean;
}

function openDatabase(): Database.Database {
  return new Database(DB_PATH, { readonly: false });
}

function fetchPendingRequests(db: Database.Database): SpawnRequest[] {
  try {
    const stmt = db.prepare(`
      SELECT * FROM spawn_requests 
      WHERE status = ? 
      ORDER BY created_at ASC 
      LIMIT ?
    `);
    return stmt.all('pending', MAX_REQUESTS_PER_CYCLE) as SpawnRequest[];
  } catch (error) {
    console.error('[SpawnProcessor] Failed to fetch spawn requests:', error);
    return [];
  }
}

function writeQueueFile(requests: SpawnRequest[]): void {
  const queue: QueueEntry[] = requests.map(req => ({
    requestId: req.id,
    taskTitle: req.task_title,
    taskDescription: req.task_description,
    taskId: req.task_id,
    isArchitect: !!req.task_id,
  }));

  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf-8');
  console.log(`[SpawnProcessor] Wrote ${queue.length} requests to queue file`);
}

function readResultsFile(): SpawnResult[] {
  try {
    if (!fs.existsSync(RESULTS_FILE)) {
      return [];
    }
    const content = fs.readFileSync(RESULTS_FILE, 'utf-8');
    const results = JSON.parse(content) as SpawnResult[];
    
    // Clean up results file after reading
    fs.unlinkSync(RESULTS_FILE);
    
    return results;
  } catch (error) {
    console.error('[SpawnProcessor] Failed to read results file:', error);
    return [];
  }
}

function updateSpawnRequest(db: Database.Database, result: SpawnResult): void {
  try {
    const updates: string[] = [];
    const values: any[] = [];

    updates.push('status = ?');
    values.push(result.status);

    if (result.status === 'completed' || result.status === 'failed') {
      updates.push("completed_at = datetime('now')");
    }

    if (result.sessionKey) {
      updates.push('session_key = ?');
      values.push(result.sessionKey);
    }

    if (result.error) {
      updates.push('error = ?');
      values.push(result.error);
    }

    values.push(result.requestId);

    const stmt = db.prepare(`
      UPDATE spawn_requests 
      SET ${updates.join(', ')} 
      WHERE id = ?
    `);
    stmt.run(...values);

    console.log(`[SpawnProcessor] Updated ${result.requestId}: ${result.status}`);
  } catch (error) {
    console.error(`[SpawnProcessor] Failed to update ${result.requestId}:`, error);
  }
}

function markRequestsProcessing(db: Database.Database, requests: SpawnRequest[]): void {
  const stmt = db.prepare(`
    UPDATE spawn_requests 
    SET status = 'processing', started_at = datetime('now')
    WHERE id = ?
  `);

  for (const req of requests) {
    try {
      stmt.run(req.id);
    } catch (error) {
      console.error(`[SpawnProcessor] Failed to mark ${req.id} as processing:`, error);
    }
  }
}

function main() {
  console.log('[SpawnProcessor] Starting spawn request processing cycle');

  const db = openDatabase();

  try {
    // Step 1: Check for results from previous cycle
    const previousResults = readResultsFile();
    if (previousResults.length > 0) {
      console.log(`[SpawnProcessor] Processing ${previousResults.length} results from previous cycle`);
      for (const result of previousResults) {
        updateSpawnRequest(db, result);
      }
    }

    // Step 2: Fetch new pending requests
    const requests = fetchPendingRequests(db);
    
    if (requests.length === 0) {
      console.log('[SpawnProcessor] No pending spawn requests');
      // Clean up queue file if it exists
      if (fs.existsSync(QUEUE_FILE)) {
        fs.unlinkSync(QUEUE_FILE);
      }
      return;
    }

    console.log(`[SpawnProcessor] Found ${requests.length} pending spawn request(s)`);

    // Step 3: Mark as processing (claim them)
    markRequestsProcessing(db, requests);

    // Step 4: Write to queue file for Jarvis
    writeQueueFile(requests);

    console.log('[SpawnProcessor] Queue file written. Jarvis will process on next heartbeat.');
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  console.error('[SpawnProcessor] Fatal error:', error);
  process.exit(1);
}
