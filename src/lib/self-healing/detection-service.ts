/**
 * Issue Detection Service
 * 
 * Main service that runs issue detection on a schedule
 */

import * as cron from 'node-cron';
import { IssueDetector, DetectionConfig } from './issue-detector';
import * as fs from 'fs';
import * as path from 'path';

export interface ServiceConfig {
  schedule: string; // Cron expression (default: "*/15 * * * *" for every 15 minutes)
  stuckTaskHours: number;
  cooldownMinutes: number;
  selfHealingDbPath: string;
  missionControlDbPath: string;
  autoStart: boolean;
}

export class DetectionService {
  private detector: IssueDetector | null = null;
  private cronJob: ReturnType<typeof cron.schedule> | null = null;
  private config: ServiceConfig;
  private running: boolean = false;

  constructor(config: ServiceConfig) {
    this.config = config;
  }

  /**
   * Start the detection service
   */
  start(): void {
    if (this.running) {
      console.log('[Service] Already running');
      return;
    }

    console.log('[Service] Starting Issue Detection Service...');
    console.log(`[Service] Schedule: ${this.config.schedule}`);
    console.log(`[Service] Stuck task threshold: ${this.config.stuckTaskHours} hours`);
    console.log(`[Service] Cooldown period: ${this.config.cooldownMinutes} minutes`);
    console.log(`[Service] Self-healing DB: ${this.config.selfHealingDbPath}`);
    console.log(`[Service] Mission Control DB: ${this.config.missionControlDbPath}`);

    // Initialize detector
    const detectorConfig: DetectionConfig = {
      stuckTaskHours: this.config.stuckTaskHours,
      cooldownMinutes: this.config.cooldownMinutes,
      detectionInterval: 15, // minutes
      dbPath: this.config.selfHealingDbPath,
      missionControlDbPath: this.config.missionControlDbPath
    };

    this.detector = new IssueDetector(detectorConfig);

    // Run immediately on start
    console.log('[Service] Running initial detection...');
    this.runDetection();

    // Schedule periodic detection
    this.cronJob = cron.schedule(this.config.schedule, () => {
      this.runDetection();
    });

    this.running = true;
    console.log('[Service] Issue Detection Service started successfully');
  }

  /**
   * Stop the detection service
   */
  stop(): void {
    if (!this.running) {
      console.log('[Service] Not running');
      return;
    }

    console.log('[Service] Stopping Issue Detection Service...');

    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }

    if (this.detector) {
      this.detector.close();
      this.detector = null;
    }

    this.running = false;
    console.log('[Service] Issue Detection Service stopped');
  }

  /**
   * Run detection cycle
   */
  private async runDetection(): Promise<void> {
    if (!this.detector) {
      console.error('[Service] Detector not initialized');
      return;
    }

    try {
      const issues = await this.detector.detectIssues();
      
      if (issues.length > 0) {
        console.log(`[Service] Detected ${issues.length} issue(s):`);
        issues.forEach(issue => {
          console.log(`  - [${issue.severity.toUpperCase()}] ${issue.title}`);
        });
      }
    } catch (error) {
      console.error('[Service] Detection cycle failed:', error);
    }
  }

  /**
   * Get service status
   */
  getStatus(): { running: boolean; config: ServiceConfig } {
    return {
      running: this.running,
      config: this.config
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      if (!this.running) {
        return { healthy: false, message: 'Service not running' };
      }

      // Check if databases are accessible
      if (!fs.existsSync(this.config.selfHealingDbPath)) {
        return { healthy: false, message: 'Self-healing database not found' };
      }

      if (!fs.existsSync(this.config.missionControlDbPath)) {
        return { healthy: false, message: 'Mission Control database not found' };
      }

      return { healthy: true, message: 'Service healthy' };
    } catch (error) {
      return { 
        healthy: false, 
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
}

/**
 * Load configuration from environment variables
 */
export function loadConfigFromEnv(): ServiceConfig {
  return {
    schedule: process.env.DETECTION_SCHEDULE || '*/15 * * * *', // Every 15 minutes by default
    stuckTaskHours: parseInt(process.env.STUCK_TASK_HOURS || '4', 10),
    cooldownMinutes: parseInt(process.env.COOLDOWN_MINUTES || '60', 10),
    selfHealingDbPath: process.env.SELF_HEALING_DB_PATH || path.join(process.cwd(), 'self-healing.db'),
    missionControlDbPath: process.env.MISSION_CONTROL_DB_PATH || path.join(process.cwd(), 'mission-control.db'),
    autoStart: process.env.AUTO_START === 'true' || process.env.AUTO_START === '1'
  };
}
