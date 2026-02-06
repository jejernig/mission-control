/**
 * Self-Healing Configuration
 * Loads configuration from environment variables
 */

import type { OrchestratorConfig } from './types';

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseStringArray(value: string | undefined, defaultValue: string[]): string[] {
  if (!value) return defaultValue;
  return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Load self-healing configuration from environment
 */
export function loadConfig(): OrchestratorConfig {
  return {
    enabled: parseBoolean(process.env.SELF_HEALING_ENABLED, true),
    scanInterval: parseNumber(process.env.SELF_HEALING_SCAN_INTERVAL, 15),
    dryRun: parseBoolean(process.env.SELF_HEALING_DRY_RUN, false),
    maxFixesPerRun: parseNumber(process.env.SELF_HEALING_MAX_FIXES_PER_RUN, 5),
    detection: {
      phantomDetection: {
        enabled: parseBoolean(process.env.SELF_HEALING_PHANTOM_DETECTION, true),
        minTimeSinceDone: parseNumber(process.env.SELF_HEALING_PHANTOM_MIN_TIME, 15),
      },
      stuckDetection: {
        enabled: parseBoolean(process.env.SELF_HEALING_STUCK_DETECTION, true),
        timeThreshold: parseNumber(process.env.SELF_HEALING_STUCK_THRESHOLD, 4),
      },
      cooldownPeriod: parseNumber(process.env.SELF_HEALING_COOLDOWN_PERIOD, 60),
      gracePeriod: parseNumber(process.env.SELF_HEALING_GRACE_PERIOD, 30),
      whitelist: parseStringArray(
        process.env.SELF_HEALING_WHITELIST,
        ['maintenance', 'monitoring']
      ),
    },
  };
}

/**
 * Get current configuration summary for logging
 */
export function getConfigSummary(config: OrchestratorConfig): string {
  return `Self-Healing Config:
  Enabled: ${config.enabled}
  Scan Interval: ${config.scanInterval} minutes
  Dry Run: ${config.dryRun}
  Max Fixes/Run: ${config.maxFixesPerRun}
  Phantom Detection: ${config.detection.phantomDetection.enabled} (${config.detection.phantomDetection.minTimeSinceDone}min threshold)
  Stuck Detection: ${config.detection.stuckDetection.enabled} (${config.detection.stuckDetection.timeThreshold}h threshold)
  Cooldown: ${config.detection.cooldownPeriod}min
  Grace Period: ${config.detection.gracePeriod}min
  Whitelist: ${config.detection.whitelist.join(', ')}`;
}
