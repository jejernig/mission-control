#!/usr/bin/env tsx
/**
 * Process Spawn Requests
 * 
 * This script fetches pending spawn requests and writes them to a queue file
 * for Jarvis to process. Jarvis reads the queue, spawns sessions, and writes
 * results back. This script then updates the database with the results.
 * 
 * Architecture:
 *   1. Script fetches pending requests from API
 *   2. Writes them to /tmp/mission-control-spawn-queue.json
 *   3. Jarvis heartbeat reads queue file
 *   4. Jarvis spawns sessions and writes results to /tmp/mission-control-spawn-results.json
 *   5. Script reads results and updates database via API
 */

import axios from 'axios';
import fs from 'fs';

const API_BASE = process.env.API_BASE || 'http://192.168.1.79:3001';
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
  isArchitect: boolean; // task-based vs generic worker
}

async function fetchPendingRequests(): Promise<SpawnRequest[]> {
  try {
    const response = await axios.get(`${API_BASE}/api/internal/spawn-requests`, {
      params: { 
        status: 'pending', 
        limit: MAX_REQUESTS_PER_CYCLE 
      },
    });
    return response.data || [];
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
    isArchitect: !!req.task_id, // Architects have task_id, workers don't
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

async function updateSpawnRequest(result: SpawnResult): Promise<void> {
  try {
    await axios.patch(`${API_BASE}/api/internal/spawn-requests`, {
      id: result.requestId,
      status: result.status,
      session_key: result.sessionKey,
      error: result.error,
    });
    console.log(`[SpawnProcessor] Updated ${result.requestId}: ${result.status}`);
  } catch (error) {
    console.error(`[SpawnProcessor] Failed to update ${result.requestId}:`, error);
  }
}

async function markRequestsProcessing(requests: SpawnRequest[]): Promise<void> {
  for (const req of requests) {
    try {
      await axios.patch(`${API_BASE}/api/internal/spawn-requests`, {
        id: req.id,
        status: 'processing',
      });
    } catch (error) {
      console.error(`[SpawnProcessor] Failed to mark ${req.id} as processing:`, error);
    }
  }
}

async function main() {
  console.log('[SpawnProcessor] Starting spawn request processing cycle');

  // Step 1: Check for results from previous cycle
  const previousResults = readResultsFile();
  if (previousResults.length > 0) {
    console.log(`[SpawnProcessor] Processing ${previousResults.length} results from previous cycle`);
    for (const result of previousResults) {
      await updateSpawnRequest(result);
    }
  }

  // Step 2: Fetch new pending requests
  const requests = await fetchPendingRequests();
  
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
  await markRequestsProcessing(requests);

  // Step 4: Write to queue file for Jarvis
  writeQueueFile(requests);

  console.log('[SpawnProcessor] Queue file written. Jarvis will process on next heartbeat.');
}

main().catch(error => {
  console.error('[SpawnProcessor] Fatal error:', error);
  process.exit(1);
});
