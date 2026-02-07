#!/usr/bin/env tsx
/**
 * Process Spawn Requests
 * 
 * This script is meant to be run by Jarvis (the OpenClaw agent) periodically.
 * It checks for pending spawn requests and uses sessions_spawn to create architect sessions.
 * 
 * DO NOT run this via child_process - it won't work because only Jarvis has access to sessions_spawn.
 */

import axios from 'axios';

const API_BASE = process.env.API_BASE || 'http://192.168.1.79:3001';

interface SpawnRequest {
  id: string;
  task_id: string;
  task_title: string;
  task_description: string | null;
  status: string;
  created_at: string;
}

async function main() {
  try {
    // Get pending spawn requests
    const response = await axios.get(`${API_BASE}/api/internal/spawn-requests`, {
      params: { status: 'pending', limit: 10 },
    });

    const requests: SpawnRequest[] = response.data;

    if (requests.length === 0) {
      console.log('No pending spawn requests');
      return;
    }

    console.log(`Found ${requests.length} pending spawn request(s)`);
    
    // Output as JSON for Jarvis to process
    console.log('SPAWN_REQUESTS:');
    console.log(JSON.stringify(requests, null, 2));

  } catch (error) {
    console.error('Failed to fetch spawn requests:', error);
    process.exit(1);
  }
}

main();
