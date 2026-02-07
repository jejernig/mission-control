import amqp from 'amqplib';
import { spawn } from 'child_process';
import { spawnArchitects } from './architect-spawner';
import { assignWorker, executionWorker, reviewWorker } from './task-workers';

const logger = {
  info: (msg: string, ...args: any[]) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args),
};

interface PipelineMessage {
  type: 'process_planning' | 'assign_workers' | 'coordinate_reviews' | 'spawn_architect';
  timestamp: string;
  batchSize: number;
}

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://mission-control:mFAxUw6adjNVUn1w%2FzPATzte1f2aGempx3CIXDmROlk%3D@localhost:5672';
const API_BASE = process.env.API_BASE || 'http://192.168.1.79:3001';

const QUEUE_CONFIG = {
  planning: { queue: 'pipeline.planning', agent: 'main' },
  assign: { queue: 'pipeline.assign', agent: 'main' },
  review: { queue: 'pipeline.review', agent: 'main' },
  architect: { queue: 'pipeline.architect', agent: 'main' },
};

export class QueueListener {
  private connection: any = null;
  private channel: any = null;
  private isShuttingDown = false;

  async start() {
    try {
      // Connect to RabbitMQ
      this.connection = await amqp.connect(RABBITMQ_URL);
      this.channel = await this.connection.createChannel();

      logger.info('✅ Queue listener connected to RabbitMQ');

      // Set up queues
      await this.setupQueues();

      // Start consuming
      await this.consumeMessages();

      // Handle graceful shutdown
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());

    } catch (error) {
      logger.error('❌ Failed to start queue listener:', error);
      setTimeout(() => this.start(), 5000); // Retry in 5s
    }
  }

  private async setupQueues() {
    if (!this.channel) return;

    // Create dead letter queue first
    await this.channel.assertQueue('pipeline.dlq', { durable: true });

    // Create work queues
    for (const config of Object.values(QUEUE_CONFIG)) {
      await this.channel.assertQueue(config.queue, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': 'pipeline.dlq',
          'x-message-ttl': 3600000, // 1 hour
        },
      });
    }

    logger.info('✅ Queues configured (4 work queues + 1 DLQ)');
  }

  private async consumeMessages() {
    if (!this.channel) return;

    for (const [_key, config] of Object.entries(QUEUE_CONFIG)) {
      await this.channel.consume(config.queue, async (msg: any) => {
        if (!msg) return;

        try {
          const message: PipelineMessage = JSON.parse(msg.content.toString());
          logger.info(`📨 Processing message: ${message.type} (${message.batchSize} batch)`);

          // Route to appropriate worker
          let count = 0;
          switch (message.type) {
            case 'spawn_architect':
              count = await spawnArchitects(message.batchSize);
              logger.info(`🏗️ Spawned ${count} architects`);
              break;
            
            case 'assign_workers':
              count = await assignWorker(message.batchSize);
              logger.info(`✅ Assigned ${count} tasks`);
              break;
            
            case 'process_planning':
              count = await executionWorker(message.batchSize);
              logger.info(`⚙️ Executed ${count} tasks`);
              break;
            
            case 'coordinate_reviews':
              count = await reviewWorker(message.batchSize);
              logger.info(`🔍 Reviewed ${count} tasks`);
              break;
            
            default:
              logger.error(`Unknown message type: ${message.type}`);
          }

          // Acknowledge message
          this.channel?.ack(msg);
          logger.info(`✅ Message acknowledged: ${message.type}`);

        } catch (error) {
          logger.error(`❌ Failed to process message from ${config.queue}:`, error);
          
          // Check retry count
          const retryCount = (msg.properties.headers?.['x-retry-count'] || 0) + 1;
          
          if (retryCount < 3) {
            // Retry by requeuing with updated retry count
            await this.requeueWithRetry(msg, retryCount);
            this.channel?.ack(msg); // Ack original, we manually requeued
            logger.info(`🔄 Requeued message (retry ${retryCount}/3)`);
          } else {
            // Send to DLQ after 3 failures
            this.channel?.reject(msg, false);
            logger.error(`☠️ Message sent to DLQ after ${retryCount} retries`);
          }
        }
      });
    }

    logger.info('🎧 Started consuming from all queues');
  }

  private spawnAgent(config: typeof QUEUE_CONFIG[keyof typeof QUEUE_CONFIG], message: PipelineMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      // Build OpenClaw spawn command
      const taskMessage = this.buildTaskMessage(message);
      
      const proc = spawn('openclaw', [
        'sessions', 'spawn',
        '--agent', config.agent,
        '--label', `Queue: ${message.type}`,
        '--task', taskMessage,
        '--cleanup', 'delete',
        '--timeout', '300',
      ]);

      let _output = '';
      let errorOutput = '';
      
      proc.stdout?.on('data', (data) => { 
        _output += data.toString();
      });
      
      proc.stderr?.on('data', (data) => { 
        errorOutput += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          logger.info(`✅ Agent completed: ${message.type}`);
          resolve();
        } else {
          logger.error(`❌ Agent failed with code ${code}`);
          if (errorOutput) logger.error(`stderr: ${errorOutput}`);
          reject(new Error(`Agent exit code ${code}`));
        }
      });

      proc.on('error', (error) => {
        logger.error('❌ Failed to spawn agent:', error);
        reject(error);
      });
    });
  }

  private buildTaskMessage(message: PipelineMessage): string {
    const tasks: Record<PipelineMessage['type'], string> = {
      process_planning: `**Task Processor Report**

Check: GET ${API_BASE}/api/tasks?status=planning&limit=${message.batchSize}

Count how many have planning_complete = 1 (ready to move).

Just report the count - don't move anything yet.

Report via sessions_send --label main --message "🔄 Planning: Found X tasks ready for inbox (planning_complete=1)"

Be brief.`,

      assign_workers: `**Worker Manager Report**

Check: GET ${API_BASE}/api/tasks?status=inbox&limit=${message.batchSize}

Count inbox tasks ready for assignment.

Just report - don't assign yet.

Report via sessions_send --label main --message "⚙️ Inbox: Found X tasks ready for workers"

Be brief.`,

      coordinate_reviews: `**Review Coordinator Report**

Check testing: GET ${API_BASE}/api/tasks?status=testing&limit=${message.batchSize}
Check review: GET ${API_BASE}/api/tasks?status=review&limit=${message.batchSize}

Count tasks in each phase.

Just report - don't coordinate yet.

Report via sessions_send --label main --message "🔍 Review: X in testing, Y in review"

Be brief.`,

      spawn_architect: `**You are Jarvis - Spawn Architects for Planning**

Your job: Find tasks needing planning specs and spawn architects to create them.

Step 1: GET ${API_BASE}/api/tasks?status=planning&limit=${message.batchSize}

Step 2: Filter to only tasks where:
- planning_complete = 0 (no spec yet)  
- planning_session_key IS NULL (no architect working on it yet)

Step 3: For EACH task that needs an architect:

A. Spawn the architect:
   openclaw sessions spawn --agent architect --label "Plan: {first-50-chars-of-title}" --task "Create planning spec for task {task_id}: {title}. GET ${API_BASE}/api/tasks/{task_id} for details. When complete, PATCH ${API_BASE}/api/tasks/{task_id} with planning_complete=1 and POST the spec to activities with activity_type=planning." --cleanup delete

B. Log it:
   POST ${API_BASE}/api/tasks/{task_id}/activities
   Body: {"activity_type": "planning", "message": "@jarvis Architect spawned to create spec"}

Step 4: Report results via sessions_send to main jarvis session:
sessions_send --label jarvis --message "🏗️ Spawned {count} architects for planning specs"

Work through the list systematically. Be the coordinator, not the doer.`,
    };

    return tasks[message.type];
  }

  private async requeueWithRetry(msg: amqp.Message, retryCount: number) {
    if (!this.channel) return;

    const headers = { 
      ...msg.properties.headers, 
      'x-retry-count': retryCount 
    };
    
    await this.channel.sendToQueue(
      msg.fields.routingKey,
      msg.content,
      { ...msg.properties, headers }
    );
  }

  private async shutdown() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('🛑 Shutting down queue listener...');
    
    await this.channel?.close();
    await this.connection?.close();
    
    logger.info('👋 Queue listener shut down');
    process.exit(0);
  }
}

// Main entry point when run directly
if (require.main === module) {
  const listener = new QueueListener();
  listener.start().catch((error) => {
    logger.error('💀 Queue listener fatal error:', error);
    process.exit(1);
  });
}
