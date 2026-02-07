/**
 * Task Workers - Autonomous agents for each pipeline stage
 * 
 * Uses spawn request queue to delegate work to Jarvis-spawned agents.
 */

const logger = {
  info: (msg: string, ...args: any[]) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args),
};

const API_BASE = process.env.API_BASE || 'http://192.168.1.79:3001';

interface SpawnRequestResponse {
  id: string;
  status: string;
}

async function createSpawnRequest(task: string, label: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/internal/spawn-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task_title: label,
      task_description: task,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create spawn request: ${response.statusText} - ${errorText}`);
  }

  const data: SpawnRequestResponse = await response.json();
  logger.info(`📨 Created spawn request: ${data.id} (${label})`);
  return data.id;
}

/**
 * Assign Worker - Takes tasks from inbox and assigns them
 */
export async function assignWorker(batchSize: number): Promise<number> {
  const taskPrompt = `**Inbox → Assigned Worker**

Your mission: Assign tasks from inbox to workers.

Step 1: Get unassigned inbox tasks
GET ${API_BASE}/api/tasks?status=inbox&limit=${batchSize}

Step 2: For EACH task without assigned_to:
  A. Review the planning spec (GET task activities, find activity_type=planning)
  B. Decide who should work on it (for now, assign to 'jarvis')
  C. Update the task:
     PATCH ${API_BASE}/api/tasks/{task_id}
     Body: {
       "status": "assigned",
       "assigned_to": "jarvis"
     }
  D. Log assignment:
     POST ${API_BASE}/api/tasks/{task_id}/activities
     Body: {
       "activity_type": "assignment",
       "message": "Assigned to jarvis for implementation"
     }

Step 3: Report count (don't send to main - just complete quietly)

Work systematically through the batch. Be decisive.`;

  try {
    await createSpawnRequest(taskPrompt, `Assign Worker (${batchSize})`);
    logger.info(`✅ Assigned 0 tasks`); // Jarvis will do the actual work
    return 0; // Spawn request queued, actual count unknown
  } catch (error) {
    logger.error(`❌ Assign worker failed:`, error);
    throw error;
  }
}

/**
 * Execution Worker - Takes assigned tasks and executes them
 */
export async function executionWorker(batchSize: number): Promise<number> {
  const taskPrompt = `**Assigned → In Progress → Testing Worker**

Your mission: Execute assigned tasks and move them to testing.

Step 1: Get assigned tasks
GET ${API_BASE}/api/tasks?status=assigned&limit=${batchSize}

Step 2: For EACH task assigned to you:
  A. Mark as in_progress:
     PATCH ${API_BASE}/api/tasks/{task_id}
     Body: {"status": "in_progress"}
  
  B. Execute the work according to the planning spec:
     - Read the spec from activities (activity_type=planning)
     - Do the actual work (run ESLint, fix code, etc.)
     - Document what you did
  
  C. Move to testing when complete:
     PATCH ${API_BASE}/api/tasks/{task_id}
     Body: {"status": "testing"}
  
  D. Log completion:
     POST ${API_BASE}/api/tasks/{task_id}/activities
     Body: {
       "activity_type": "completion",
       "message": "Work completed. Moved to testing for verification."
     }

Step 3: Complete quietly (don't send to main)

Do the work. Don't just report - actually execute.`;

  try {
    await createSpawnRequest(taskPrompt, `Execution Worker (${batchSize})`);
    logger.info(`⚙️ Executed 0 tasks`); // Jarvis will do the actual work
    return 0; // Spawn request queued, actual count unknown
  } catch (error) {
    logger.error(`❌ Execution worker failed:`, error);
    throw error;
  }
}

/**
 * Review Worker - Verifies testing tasks and moves to review/done
 */
export async function reviewWorker(batchSize: number): Promise<number> {
  const taskPrompt = `**Testing → Review → Done Worker**

Your mission: Review and approve completed work.

Step 1: Get testing tasks
GET ${API_BASE}/api/tasks?status=testing&limit=${batchSize}

Step 2: For EACH task in testing:
  A. Review the work:
     - Check what was done (read completion activities)
     - Verify it matches the spec
     - Run any tests if applicable
  
  B. Move to review:
     PATCH ${API_BASE}/api/tasks/{task_id}
     Body: {"status": "review"}
  
  C. Final approval:
     PATCH ${API_BASE}/api/tasks/{task_id}
     Body: {"status": "done"}
  
  D. Log completion:
     POST ${API_BASE}/api/tasks/{task_id}/activities
     Body: {
       "activity_type": "review",
       "message": "Work reviewed and approved. Task complete! ✅"
     }

Step 3: Complete quietly (don't send to main)

Review thoroughly but decisively. Move good work to done.`;

  try {
    await createSpawnRequest(taskPrompt, `Review Worker (${batchSize})`);
    logger.info(`🔍 Reviewed 0 tasks`); // Jarvis will do the actual work
    return 0; // Spawn request queued, actual count unknown
  } catch (error) {
    logger.error(`❌ Review worker failed:`, error);
    throw error;
  }
}
