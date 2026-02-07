/**
 * Spawn Request Processor Service
 * 
 * Monitors the spawn_requests table and uses OpenClaw sessions_spawn to create agents.
 * Runs as a systemd service with periodic polling.
 */

import { queryAll, run } from '../lib/db';
import axios from 'axios';

const API_BASE = process.env.API_BASE || 'http://192.168.1.79:3001';
const OPENCLAW_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';
const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';
const BATCH_SIZE = 5;
const POLL_INTERVAL_MS = 60000; // 1 minute

interface SpawnRequest {
  id: string;
  task_id: string | null;
  task_title: string;
  task_description: string | null;
  status: string;
}

async function callOpenClaw(method: string, params?: any): Promise<any> {
  const response = await axios.post(
    OPENCLAW_URL,
    {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENCLAW_TOKEN}`,
      },
    }
  );

  if (response.data.error) {
    throw new Error(`OpenClaw error: ${response.data.error.message}`);
  }

  return response.data.result;
}

async function processSingleRequest(request: SpawnRequest): Promise<void> {
  console.log(`[Processor] Processing spawn request: ${request.id} - ${request.task_title}`);

  try {
    // Determine if architect (has task_id) or worker (no task_id)
    const isArchitect = !!request.task_id;
    
    let task: string;
    let label: string;

    if (isArchitect) {
      task = `Create autonomous planning spec for: ${request.task_title}

You are an architect creating a detailed implementation spec. Be autonomous - make reasonable assumptions, document them, and create a complete spec.${request.task_id ? `\n\nTask ID: ${request.task_id}` : ''}

After completing the spec, update the spawn request:
PATCH ${API_BASE}/api/internal/spawn-requests
Body: {"id": "${request.id}", "status": "completed"}`;
      label = `Architect: ${request.task_title}`;
    } else {
      // Worker spawn
      task = request.task_description || request.task_title;
      label = request.task_title;
    }

    // Mark as processing
    run(`UPDATE spawn_requests SET status = 'processing', started_at = ? WHERE id = ?`, [
      new Date().toISOString(),
      request.id,
    ]);

    // Spawn agent via OpenClaw
    const result = await callOpenClaw('sessions.spawn', {
      task,
      label,
      cleanup: 'delete',
      timeout_seconds: 600,
    });

    console.log(`[Processor] Spawned agent: ${result.childSessionKey}`);

    // Mark as completed
    run(
      `UPDATE spawn_requests SET status = 'completed', completed_at = ?, session_key = ? WHERE id = ?`,
      [new Date().toISOString(), result.childSessionKey, request.id]
    );

    console.log(`[Processor] ✅ Completed spawn request: ${request.id}`);
  } catch (error) {
    console.error(`[Processor] ❌ Failed to process spawn request ${request.id}:`, error);

    // Mark as failed
    run(`UPDATE spawn_requests SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`, [
      error instanceof Error ? error.message : String(error),
      new Date().toISOString(),
      request.id,
    ]);
  }
}

async function processSpawnRequests(): Promise<void> {
  try {
    // Get pending spawn requests
    const requests = queryAll<SpawnRequest>(
      `SELECT id, task_id, task_title, task_description, status 
       FROM spawn_requests 
       WHERE status = 'pending' 
       ORDER BY created_at ASC 
       LIMIT ?`,
      [BATCH_SIZE]
    );

    if (requests.length === 0) {
      console.log('[Processor] No pending spawn requests');
      return;
    }

    console.log(`[Processor] Found ${requests.length} pending spawn request(s)`);

    for (const request of requests) {
      await processSingleRequest(request);
    }
  } catch (error) {
    console.error('[Processor] Error processing spawn requests:', error);
  }
}

async function main() {
  console.log('[Processor] Spawn Request Processor started');
  console.log(`[Processor] Polling every ${POLL_INTERVAL_MS}ms, batch size: ${BATCH_SIZE}`);

  // Process immediately on startup
  await processSpawnRequests();

  // Then poll periodically
  setInterval(async () => {
    await processSpawnRequests();
  }, POLL_INTERVAL_MS);
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Processor] Received SIGTERM, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Processor] Received SIGINT, shutting down...');
  process.exit(0);
});

main().catch((error) => {
  console.error('[Processor] Fatal error:', error);
  process.exit(1);
});
