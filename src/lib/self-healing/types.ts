/**
 * Self-Healing System Types
 * Type definitions for the self-healing pipeline
 */

// ============================================================================
// Issue Types
// ============================================================================

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type IssueStatus = 'detected' | 'analyzing' | 'fixing' | 'fixed' | 'failed' | 'ignored';

export interface Issue {
  id: string;
  title: string;
  description?: string;
  severity: IssueSeverity;
  status: IssueStatus;
  source: string;
  error_type?: string;
  error_message?: string;
  stack_trace?: string;
  metadata?: Record<string, any>;
  detected_at: number;
  updated_at: number;
  resolved_at?: number;
  pattern_id?: string;
  fix_id?: string;
}

// ============================================================================
// Pattern Types
// ============================================================================

export type PatternType = 'regex' | 'signature' | 'ml_model' | 'heuristic';

export interface Pattern {
  id: string;
  name: string;
  description?: string;
  pattern_type: PatternType;
  pattern_data: Record<string, any>;
  confidence_threshold: number;
  severity?: IssueSeverity;
  tags?: string[];
  match_count: number;
  success_rate: number;
  is_active: boolean;
  created_at: number;
  updated_at: number;
  last_matched_at?: number;
}

// ============================================================================
// RCA Types
// ============================================================================

export type AnalysisMethod = 'pattern_match' | 'llm' | 'heuristic' | 'manual';

export interface FailurePattern {
  id: string;
  name: string;
  description?: string;
  signal_type: string;
  conditions: PatternConditions;
  root_cause: string;
  recommended_action?: string;
  confidence_weight: number;
  severity?: IssueSeverity;
  match_count: number;
  success_count: number;
  is_active: boolean;
  created_at: number;
  updated_at: number;
  last_matched_at?: number;
}

export interface PatternConditions {
  signal_contains?: string;
  activity_contains?: string;
  status?: string;
  agent_role?: { not?: string; equals?: string; in?: string[] };
  agent_active_tasks?: { gt?: number; gte?: number; lt?: number; lte?: number };
  deliverables_empty?: boolean;
  no_recent_activity?: boolean;
  days_stale?: { gt?: number; gte?: number; lt?: number; lte?: number };
  days_since_activity?: { gt?: number; gte?: number; lt?: number; lte?: number };
  [key: string]: any; // Allow custom conditions
}

export interface RCAResult {
  id: string;
  issue_id: string;
  pattern_id?: string;
  root_cause: string;
  confidence: number;
  analysis_method: AnalysisMethod;
  matched_conditions?: Record<string, boolean>;
  recommended_actions?: string[];
  metadata?: Record<string, any>;
  analyzed_at: number;
  analyst_agent: string;
}

// ============================================================================
// Pattern Match Types
// ============================================================================

export interface PatternMatch {
  pattern: FailurePattern;
  confidence: number;
  matched_conditions: Record<string, boolean>;
  recommended_actions: string[];
}

export interface RCAAnalysisInput {
  issue: Issue;
  task_data?: {
    id: string;
    status: string;
    assigned_to?: string;
    agent_role?: string;
    deliverables_count: number;
    last_activity_at?: number;
    activity_text?: string;
    agent_active_task_count?: number;
  };
}

export interface RCAAnalysisResult {
  matches: PatternMatch[];
  best_match?: PatternMatch;
  analysis_method: AnalysisMethod;
  analyzed_at: number;
  metadata?: Record<string, any>;
}

// ============================================================================
// Fix Types
// ============================================================================

export type FixType = 'restart' | 'config_change' | 'script' | 'rollback' | 'scale' | 'manual' | 'custom';
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export interface Fix {
  id: string;
  name: string;
  description?: string;
  fix_type: FixType;
  pattern_id?: string;
  action_data: Record<string, any>;
  prerequisites?: Record<string, any>;
  rollback_data?: Record<string, any>;
  risk_level: RiskLevel;
  max_retries: number;
  timeout_seconds: number;
  requires_approval: boolean;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export type FixExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'rolled_back' | 'cancelled';

export interface FixExecution {
  id: string;
  issue_id: string;
  fix_id: string;
  status: FixExecutionStatus;
  attempt_number: number;
  started_at: number;
  completed_at?: number;
  duration_ms?: number;
  output?: string;
  error_message?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// System Health Types
// ============================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';

export interface SystemHealth {
  id: string;
  health_score: number;
  status: HealthStatus;
  active_issues: number;
  resolved_issues_24h: number;
  failed_fixes_24h: number;
  average_resolution_time_ms?: number;
  details?: Record<string, any>;
  timestamp: number;
}

// ============================================================================
// Metrics Types
// ============================================================================

export interface Metric {
  id: string;
  metric_type: string;
  metric_name: string;
  metric_value: number;
  unit?: string;
  source?: string;
  tags?: Record<string, string>;
  timestamp: number;
  metadata?: Record<string, any>;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface DetectionConfig {
  phantomDetection: {
    enabled: boolean;
    minTimeSinceDone: number; // minutes
  };
  stuckDetection: {
    enabled: boolean;
    timeThreshold: number; // hours
  };
  cooldownPeriod: number; // minutes
  gracePeriod: number; // minutes for new tasks
  whitelist: string[]; // task patterns to ignore
}

export interface OrchestratorConfig {
  enabled: boolean;
  scanInterval: number; // minutes
  detection: DetectionConfig;
  dryRun: boolean; // if true, detect and analyze but don't create fix tasks
  maxFixesPerRun: number; // limit number of fixes created in one scan
}
