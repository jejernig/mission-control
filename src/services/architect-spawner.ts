import axios from 'axios';

const logger = {
  info: (msg: string, ...args: any[]) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args),
};

const API_BASE = process.env.API_BASE || 'http://192.168.1.79:3001';

interface Task {
  id: string;
  title: string;
  planning_complete: number;
  planning_session_key: string | null;
}

// Global in-memory tracker to prevent duplicates across concurrent calls
const spawnedThisRun = new Set<string>();
const SPAWN_MARKER = '🏗️ ARCHITECT_SPAWNED';

export async function spawnArchitects(batchSize: number): Promise<number> {
  try {
    // 1. Get tasks needing architects
    const response = await axios.get(`${API_BASE}/api/tasks`, {
      params: { status: 'planning', limit: batchSize },
    });

    const tasks: Task[] = response.data;
    
    // 2. Filter: planning_complete=0 AND planning_session_key IS NULL
    const needsArchitect = tasks.filter(
      (t) => t.planning_complete === 0 && !t.planning_session_key
    );

    logger.info(`🏗️  Found ${needsArchitect.length}/${tasks.length} tasks needing architects`);

    // 3. Spawn architect for each with DUAL locking (in-memory + activity log)
    // Limit to batchSize to prevent overwhelming the system
    const tasksToProcess = needsArchitect.slice(0, batchSize);
    logger.info(`🎯 Processing ${tasksToProcess.length} tasks (batch limit: ${batchSize})`);
    
    let spawned = 0;
    let skipped = 0;
    
    for (const task of tasksToProcess) {
      try {
        // LOCK 1: In-memory check (prevents duplicates in THIS run)
        if (spawnedThisRun.has(task.id)) {
          logger.info(`⏭️  [MEM] Skipping ${task.title.substring(0, 40)} - already processing`);
          skipped++;
          continue;
        }
        
        // LOCK 2: Activity log check (prevents duplicates across runs)
        const activitiesResp = await axios.get(`${API_BASE}/api/tasks/${task.id}/activities`);
        const alreadySpawned = activitiesResp.data.some((a: any) => 
          a.message && (a.message.includes('Architect spawned') || a.message.includes(SPAWN_MARKER))
        );
        
        if (alreadySpawned) {
          logger.info(`⏭️  [DB] Skipping ${task.title.substring(0, 40)} - architect already exists`);
          skipped++;
          continue;
        }
        
        // CLAIM the task immediately (in-memory + database)
        spawnedThisRun.add(task.id);
        
        await axios.post(`${API_BASE}/api/tasks/${task.id}/activities`, {
          activity_type: 'planning',
          message: `${SPAWN_MARKER} @jarvis Architect assigned - creating planning spec`,
        });
        
        // Now spawn the architect (task is double-locked, safe from duplicates)
        await spawnArchitectSession(task);
        spawned++;
        
      } catch (error) {
        logger.error(`Failed to spawn architect for task ${task.id}:`, error);
        // Remove from in-memory tracker on failure so it can be retried
        spawnedThisRun.delete(task.id);
      }
    }

    logger.info(`🏗️  Batch complete: ${spawned} queued, ${skipped} skipped, ${needsArchitect.length} checked`);
    
    // Clean up in-memory tracker (keep only last 1000 to prevent memory leak)
    if (spawnedThisRun.size > 1000) {
      const entries = Array.from(spawnedThisRun);
      const toKeep = entries.slice(-500); // Keep last 500
      spawnedThisRun.clear();
      toKeep.forEach(id => spawnedThisRun.add(id));
      logger.info(`🧹 Cleaned in-memory tracker: ${entries.length} → ${toKeep.length}`);
    }
    
    return spawned;
    
  } catch (error) {
    logger.error('❌ Architect spawner failed:', error);
    throw error;
  }
}

async function spawnArchitectSession(task: Task): Promise<void> {
  try {
    // Instead of trying to spawn via CLI (which doesn't work),
    // POST a spawn request that Jarvis will pick up and process
    await axios.post(`${API_BASE}/api/internal/spawn-requests`, {
      task_id: task.id,
      task_title: task.title,
      task_description: `Create autonomous planning spec for: ${task.title}`,
    });
    
    logger.info(`✅ Queued spawn request for: ${task.title.substring(0, 40)}`);
  } catch (error) {
    logger.error(`Failed to queue spawn request for ${task.id}:`, error);
    throw error;
  }
}
