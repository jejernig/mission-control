/**
 * RCA Database Operations
 * Database helpers for failure patterns and RCA results
 */

import Database from 'better-sqlite3';
import type { FailurePattern, RCAResult } from './types';

/**
 * Get all active failure patterns, optionally filtered by signal type
 */
export function getFailurePatterns(
  db: Database.Database,
  signalType?: string
): FailurePattern[] {
  let sql = `
    SELECT 
      id, name, description, signal_type, conditions, root_cause,
      recommended_action, confidence_weight, severity, match_count,
      success_count, is_active, created_at, updated_at, last_matched_at
    FROM failure_patterns
    WHERE is_active = 1
  `;

  if (signalType) {
    sql += ' AND signal_type = ?';
    const stmt = db.prepare(sql);
    return stmt.all(signalType).map(parseFailurePattern);
  } else {
    const stmt = db.prepare(sql);
    return stmt.all().map(parseFailurePattern);
  }
}

/**
 * Get a specific failure pattern by ID
 */
export function getFailurePattern(
  db: Database.Database,
  id: string
): FailurePattern | null {
  const sql = `
    SELECT 
      id, name, description, signal_type, conditions, root_cause,
      recommended_action, confidence_weight, severity, match_count,
      success_count, is_active, created_at, updated_at, last_matched_at
    FROM failure_patterns
    WHERE id = ?
  `;

  const stmt = db.prepare(sql);
  const row = stmt.get(id);
  return row ? parseFailurePattern(row) : null;
}

/**
 * Create a new RCA result
 */
export function createRCAResult(
  db: Database.Database,
  result: RCAResult
): void {
  const sql = `
    INSERT INTO rca_results (
      id, issue_id, pattern_id, root_cause, confidence,
      analysis_method, matched_conditions, recommended_actions,
      metadata, analyzed_at, analyst_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const stmt = db.prepare(sql);
  stmt.run(
    result.id,
    result.issue_id,
    result.pattern_id || null,
    result.root_cause,
    result.confidence,
    result.analysis_method,
    JSON.stringify(result.matched_conditions || {}),
    JSON.stringify(result.recommended_actions || []),
    JSON.stringify(result.metadata || {}),
    result.analyzed_at,
    result.analyst_agent
  );
}

/**
 * Update pattern statistics after a match
 */
export function updatePatternStats(
  db: Database.Database,
  patternId: string,
  success: boolean = false
): void {
  const sql = `
    UPDATE failure_patterns
    SET 
      match_count = match_count + 1,
      success_count = success_count + ?,
      last_matched_at = ?,
      updated_at = ?
    WHERE id = ?
  `;

  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(sql);
  stmt.run(success ? 1 : 0, now, now, patternId);
}

/**
 * Get RCA results for an issue
 */
export function getRCAResults(
  db: Database.Database,
  issueId: string
): RCAResult[] {
  const sql = `
    SELECT 
      id, issue_id, pattern_id, root_cause, confidence,
      analysis_method, matched_conditions, recommended_actions,
      metadata, analyzed_at, analyst_agent
    FROM rca_results
    WHERE issue_id = ?
    ORDER BY analyzed_at DESC
  `;

  const stmt = db.prepare(sql);
  return stmt.all(issueId).map(parseRCAResult);
}

/**
 * Get unmatched issues (issues without RCA results or with low confidence)
 */
export function getUnmatchedIssues(
  db: Database.Database,
  confidenceThreshold: number = 0.7
): Array<{ issue_id: string; title: string; source: string }> {
  const sql = `
    SELECT DISTINCT i.id as issue_id, i.title, i.source
    FROM issues i
    LEFT JOIN rca_results r ON i.id = r.issue_id
    WHERE i.status IN ('detected', 'analyzing')
      AND (r.id IS NULL OR r.confidence < ?)
    ORDER BY i.detected_at DESC
  `;

  const stmt = db.prepare(sql);
  return stmt.all(confidenceThreshold) as Array<{
    issue_id: string;
    title: string;
    source: string;
  }>;
}

/**
 * Get pattern match statistics
 */
export function getPatternStats(db: Database.Database): Array<{
  pattern_id: string;
  name: string;
  match_count: number;
  success_count: number;
  success_rate: number;
}> {
  const sql = `
    SELECT 
      id as pattern_id,
      name,
      match_count,
      success_count,
      CASE 
        WHEN match_count > 0 THEN (success_count * 100.0 / match_count)
        ELSE 0
      END as success_rate
    FROM failure_patterns
    WHERE is_active = 1
    ORDER BY match_count DESC
  `;

  const stmt = db.prepare(sql);
  return stmt.all() as Array<{
    pattern_id: string;
    name: string;
    match_count: number;
    success_count: number;
    success_rate: number;
  }>;
}

/**
 * Parse database row to FailurePattern
 */
function parseFailurePattern(row: any): FailurePattern {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    signal_type: row.signal_type,
    conditions: JSON.parse(row.conditions),
    root_cause: row.root_cause,
    recommended_action: row.recommended_action,
    confidence_weight: row.confidence_weight,
    severity: row.severity,
    match_count: row.match_count,
    success_count: row.success_count,
    is_active: row.is_active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_matched_at: row.last_matched_at,
  };
}

/**
 * Parse database row to RCAResult
 */
function parseRCAResult(row: any): RCAResult {
  return {
    id: row.id,
    issue_id: row.issue_id,
    pattern_id: row.pattern_id,
    root_cause: row.root_cause,
    confidence: row.confidence,
    analysis_method: row.analysis_method,
    matched_conditions: JSON.parse(row.matched_conditions || '{}'),
    recommended_actions: JSON.parse(row.recommended_actions || '[]'),
    metadata: JSON.parse(row.metadata || '{}'),
    analyzed_at: row.analyzed_at,
    analyst_agent: row.analyst_agent,
  };
}
