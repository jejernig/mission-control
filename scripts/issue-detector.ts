#!/usr/bin/env tsx
/**
 * Issue Detection Service CLI
 * 
 * Command-line interface for the issue detection service
 * 
 * Usage:
 *   tsx scripts/issue-detector.ts start   - Start the service
 *   tsx scripts/issue-detector.ts once    - Run detection once and exit
 *   tsx scripts/issue-detector.ts health  - Check service health
 */

import { DetectionService, loadConfigFromEnv } from '../src/lib/self-healing/detection-service';
import { initializeSelfHealingDb } from '../src/lib/self-healing/init-db';
import * as path from 'path';
import * as fs from 'fs';

const command = process.argv[2] || 'start';

async function main() {
  console.log('='.repeat(60));
  console.log('Mission Control - Issue Detection Service');
  console.log('='.repeat(60));
  console.log();

  // Load configuration
  const config = loadConfigFromEnv();

  // Initialize database if it doesn't exist
  if (!fs.existsSync(config.selfHealingDbPath)) {
    console.log('[Init] Self-healing database not found, creating...');
    try {
      initializeSelfHealingDb(config.selfHealingDbPath);
    } catch (error) {
      console.error('[Init] Failed to initialize database:', error);
      process.exit(1);
    }
  }

  // Verify Mission Control database exists
  if (!fs.existsSync(config.missionControlDbPath)) {
    console.error(`[Error] Mission Control database not found at: ${config.missionControlDbPath}`);
    console.error('[Error] Please ensure Mission Control is running and the database exists');
    process.exit(1);
  }

  const service = new DetectionService(config);

  switch (command) {
    case 'start':
      console.log('[Command] Starting service...');
      service.start();
      
      // Keep process alive
      console.log('[Service] Press Ctrl+C to stop');
      
      process.on('SIGINT', () => {
        console.log('\n[Signal] Received SIGINT, shutting down...');
        service.stop();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        console.log('\n[Signal] Received SIGTERM, shutting down...');
        service.stop();
        process.exit(0);
      });
      break;

    case 'once':
      console.log('[Command] Running detection once...');
      service.start();
      
      // Wait a bit for initial detection to complete
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      service.stop();
      console.log('[Command] Detection complete');
      process.exit(0);
      break;

    case 'health':
      console.log('[Command] Checking health...');
      const health = await service.healthCheck();
      console.log(`[Health] Status: ${health.healthy ? '✓ Healthy' : '✗ Unhealthy'}`);
      console.log(`[Health] Message: ${health.message}`);
      process.exit(health.healthy ? 0 : 1);
      break;

    default:
      console.error(`[Error] Unknown command: ${command}`);
      console.log();
      console.log('Available commands:');
      console.log('  start   - Start the detection service');
      console.log('  once    - Run detection once and exit');
      console.log('  health  - Check service health');
      process.exit(1);
  }
}

main().catch(error => {
  console.error('[Fatal] Unhandled error:', error);
  process.exit(1);
});
