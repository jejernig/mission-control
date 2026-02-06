/**
 * Self-Healing Orchestrator
 * Main service loop that coordinates detection, RCA, and fix generation
 */

import { DetectionService, type DetectionConfig } from './detection';
import { RCAService } from './rca';
import { FixGeneratorService } from './fix-generator';
import { db } from '../db';

export interface OrchestratorConfig {
  enabled: boolean;
  scanInterval: number; // minutes
  detection: DetectionConfig;
  dryRun: boolean; // if true, detect and analyze but don't create fix tasks
  maxFixesPerRun: number; // limit number of fixes created in one scan
}

export interface OrchestratorStats {
  lastRun: Date | null;
  totalScans: number;
  totalIssuesDetected: number;
  totalFixesCreated: number;
  lastIssuesDetected: number;
  lastFixesCreated: number;
  errors: Array<{ timestamp: Date; error: string }>;
}

export class SelfHealingOrchestrator {
  private config: OrchestratorConfig;
  private detection: DetectionService;
  private rca: RCAService;
  private fixGenerator: FixGeneratorService;
  private stats: OrchestratorStats;
  private running: boolean = false;
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      scanInterval: config.scanInterval ?? 15, // 15 minutes default
      detection: config.detection ?? {},
      dryRun: config.dryRun ?? false,
      maxFixesPerRun: config.maxFixesPerRun ?? 5,
    };

    this.detection = new DetectionService(this.config.detection);
    this.rca = new RCAService();
    this.fixGenerator = new FixGeneratorService();

    this.stats = {
      lastRun: null,
      totalScans: 0,
      totalIssuesDetected: 0,
      totalFixesCreated: 0,
      lastIssuesDetected: 0,
      lastFixesCreated: 0,
      errors: [],
    };
  }

  /**
   * Start the orchestrator
   */
  start(): void {
    if (this.running) {
      console.log('[Self-Healing] Already running');
      return;
    }

    if (!this.config.enabled) {
      console.log('[Self-Healing] Orchestrator is disabled in config');
      return;
    }

    console.log(`[Self-Healing] Starting orchestrator (scan every ${this.config.scanInterval} minutes)`);
    this.running = true;

    // Run immediately on start
    this.runScan();

    // Schedule periodic scans
    this.intervalHandle = setInterval(() => {
      this.runScan();
    }, this.config.scanInterval * 60 * 1000);
  }

  /**
   * Stop the orchestrator
   */
  stop(): void {
    if (!this.running) {
      console.log('[Self-Healing] Not running');
      return;
    }

    console.log('[Self-Healing] Stopping orchestrator');
    this.running = false;

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Run a single scan cycle
   */
  async runScan(): Promise<void> {
    try {
      console.log('[Self-Healing] Starting scan...');
      const startTime = Date.now();

      this.stats.lastRun = new Date();
      this.stats.totalScans++;
      this.stats.lastIssuesDetected = 0;
      this.stats.lastFixesCreated = 0;

      // Step 1: Detect issues
      const detectionResults = await this.detection.scanAllTasks();
      console.log(`[Self-Healing] Detected ${detectionResults.length} issues`);

      this.stats.lastIssuesDetected = detectionResults.length;
      this.stats.totalIssuesDetected += detectionResults.length;

      // Step 2: Process each detected issue
      let fixesCreated = 0;
      for (const detection of detectionResults) {
        // Respect max fixes per run limit
        if (fixesCreated >= this.config.maxFixesPerRun) {
          console.log(`[Self-Healing] Reached max fixes per run (${this.config.maxFixesPerRun})`);
          break;
        }

        try {
          // Get the task
          const task = await db.getTask(detection.taskId);
          if (!task) {
            console.warn(`[Self-Healing] Task ${detection.taskId} not found`);
            continue;
          }

          console.log(`[Self-Healing] Analyzing ${detection.issueType} for task: ${task.title}`);

          // Step 3: Perform RCA
          const rcaResult = await this.rca.analyze(task, detection);
          console.log(`[Self-Healing] RCA complete - Root cause: ${rcaResult.rootCause} (confidence: ${(rcaResult.confidence * 100).toFixed(0)}%)`);

          // Step 4: Generate fix task
          const fixTask = await this.fixGenerator.generateFix(task, rcaResult);
          console.log(`[Self-Healing] Generated fix: ${fixTask.title}`);

          if (!this.config.dryRun) {
            // Step 5: Create fix task in database
            const fixTaskId = await this.fixGenerator.createFixTask(fixTask);
            console.log(`[Self-Healing] Created fix task: ${fixTaskId}`);

            // Step 6: Notify original task
            await this.fixGenerator.notifyOriginalTask(task.id, fixTaskId, rcaResult);
            console.log(`[Self-Healing] Notified original task: ${task.id}`);

            fixesCreated++;
            this.stats.lastFixesCreated++;
            this.stats.totalFixesCreated++;
          } else {
            console.log('[Self-Healing] DRY RUN - Fix task not created');
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[Self-Healing] Error processing task ${detection.taskId}:`, errorMsg);
          this.recordError(errorMsg);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[Self-Healing] Scan complete in ${duration}ms - Issues: ${detectionResults.length}, Fixes created: ${fixesCreated}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[Self-Healing] Error during scan:', errorMsg);
      this.recordError(errorMsg);
    }
  }

  /**
   * Get current statistics
   */
  getStats(): OrchestratorStats {
    return { ...this.stats };
  }

  /**
   * Get health status
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'error';
    running: boolean;
    lastRun: Date | null;
    stats: OrchestratorStats;
  } {
    let status: 'healthy' | 'degraded' | 'error' = 'healthy';

    // Check if we have recent errors
    const recentErrors = this.stats.errors.filter(e => {
      const hoursSinceError = (Date.now() - e.timestamp.getTime()) / (1000 * 60 * 60);
      return hoursSinceError < 1;
    });

    if (recentErrors.length > 5) {
      status = 'error';
    } else if (recentErrors.length > 0) {
      status = 'degraded';
    }

    // Check if last run was recent
    if (this.running && this.stats.lastRun) {
      const minutesSinceLastRun = (Date.now() - this.stats.lastRun.getTime()) / (1000 * 60);
      if (minutesSinceLastRun > this.config.scanInterval * 2) {
        status = 'degraded';
      }
    }

    return {
      status,
      running: this.running,
      lastRun: this.stats.lastRun,
      stats: this.getStats(),
    };
  }

  /**
   * Record an error
   */
  private recordError(error: string): void {
    this.stats.errors.push({
      timestamp: new Date(),
      error,
    });

    // Keep only last 100 errors
    if (this.stats.errors.length > 100) {
      this.stats.errors = this.stats.errors.slice(-100);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<OrchestratorConfig>): void {
    const wasRunning = this.running;
    
    if (wasRunning) {
      this.stop();
    }

    this.config = {
      ...this.config,
      ...newConfig,
    };

    // Recreate detection service with new config
    if (newConfig.detection) {
      this.detection = new DetectionService(this.config.detection);
    }

    if (wasRunning && this.config.enabled) {
      this.start();
    }

    console.log('[Self-Healing] Configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }
}

// Singleton instance
let orchestratorInstance: SelfHealingOrchestrator | null = null;

export function getOrchestrator(): SelfHealingOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new SelfHealingOrchestrator();
  }
  return orchestratorInstance;
}
