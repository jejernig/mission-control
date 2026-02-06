/**
 * Root Cause Analysis (RCA) Engine
 * Pattern matching engine for identifying root causes of detected issues
 */

import { randomUUID } from 'crypto';
import type {
  Issue,
  FailurePattern,
  PatternConditions,
  RCAAnalysisInput,
  RCAAnalysisResult,
  PatternMatch,
  RCAResult,
} from './types';

/**
 * RCA Engine - Analyzes issues and matches them against known failure patterns
 */
export class RCAEngine {
  /**
   * Analyze an issue and find matching patterns
   */
  async analyzeIssue(
    input: RCAAnalysisInput,
    patterns: FailurePattern[]
  ): Promise<RCAAnalysisResult> {
    const startTime = Date.now();
    const matches: PatternMatch[] = [];

    // Filter active patterns
    const activePatterns = patterns.filter((p) => p.is_active);

    // Evaluate each pattern
    for (const pattern of activePatterns) {
      const match = this.evaluatePattern(input, pattern);
      if (match) {
        matches.push(match);
      }
    }

    // Sort by confidence (highest first)
    matches.sort((a, b) => b.confidence - a.confidence);

    const analysisTime = Date.now() - startTime;

    return {
      matches,
      best_match: matches.length > 0 ? matches[0] : undefined,
      analysis_method: 'pattern_match',
      analyzed_at: Date.now(),
      metadata: {
        analysis_time_ms: analysisTime,
        patterns_evaluated: activePatterns.length,
        patterns_matched: matches.length,
      },
    };
  }

  /**
   * Evaluate a single pattern against the input
   */
  private evaluatePattern(
    input: RCAAnalysisInput,
    pattern: FailurePattern
  ): PatternMatch | null {
    const { issue, task_data } = input;
    const conditions = pattern.conditions;
    const matchedConditions: Record<string, boolean> = {};
    let totalConditions = 0;
    let matchedCount = 0;

    // Evaluate each condition
    for (const [key, value] of Object.entries(conditions)) {
      totalConditions++;
      const matches = this.evaluateCondition(key, value, { issue, task_data });
      matchedConditions[key] = matches;
      if (matches) matchedCount++;
    }

    // If no conditions matched, return null
    if (matchedCount === 0) {
      return null;
    }

    // Calculate confidence based on:
    // 1. Percentage of conditions matched
    // 2. Pattern's confidence weight
    const conditionMatchRate = totalConditions > 0 ? matchedCount / totalConditions : 0;
    const confidence = conditionMatchRate * pattern.confidence_weight;

    // Only return match if confidence is reasonable (>= 0.5)
    if (confidence < 0.5) {
      return null;
    }

    const recommended_actions = pattern.recommended_action
      ? [pattern.recommended_action]
      : [];

    return {
      pattern,
      confidence,
      matched_conditions: matchedConditions,
      recommended_actions,
    };
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(
    key: string,
    value: any,
    context: { issue: Issue; task_data?: RCAAnalysisInput['task_data'] }
  ): boolean {
    const { issue, task_data } = context;

    try {
      switch (key) {
        case 'signal_contains':
          return this.stringContains(
            issue.title + ' ' + (issue.description || ''),
            value
          );

        case 'activity_contains':
          if (!task_data?.activity_text) return false;
          return this.stringContains(task_data.activity_text, value);

        case 'status':
          return task_data?.status === value;

        case 'agent_role':
          return this.evaluateAgentRole(task_data?.agent_role, value);

        case 'agent_active_tasks':
          return this.evaluateNumericCondition(
            task_data?.agent_active_task_count,
            value
          );

        case 'deliverables_empty':
          return value === true && (task_data?.deliverables_count || 0) === 0;

        case 'no_recent_activity':
          if (!value || !task_data?.last_activity_at) return false;
          const daysSinceActivity =
            (Date.now() - task_data.last_activity_at) / (1000 * 60 * 60 * 24);
          return daysSinceActivity >= 1;

        case 'days_stale':
          const daysStale = (Date.now() - issue.detected_at) / (1000 * 60 * 60 * 24);
          return this.evaluateNumericCondition(daysStale, value);

        case 'days_since_activity':
          if (!task_data?.last_activity_at) return false;
          const daysSince =
            (Date.now() - task_data.last_activity_at) / (1000 * 60 * 60 * 24);
          return this.evaluateNumericCondition(daysSince, value);

        default:
          // Unknown condition, skip
          return false;
      }
    } catch (error) {
      console.error(`Error evaluating condition ${key}:`, error);
      return false;
    }
  }

  /**
   * Check if a string contains a substring (case-insensitive)
   */
  private stringContains(haystack: string, needle: string): boolean {
    return haystack.toLowerCase().includes(needle.toLowerCase());
  }

  /**
   * Evaluate agent role conditions
   */
  private evaluateAgentRole(
    agentRole: string | undefined,
    condition: any
  ): boolean {
    if (!agentRole) return false;

    if (typeof condition === 'string') {
      return agentRole === condition;
    }

    if (typeof condition === 'object') {
      if (condition.not !== undefined) {
        return agentRole !== condition.not;
      }
      if (condition.equals !== undefined) {
        return agentRole === condition.equals;
      }
      if (condition.in !== undefined && Array.isArray(condition.in)) {
        return condition.in.includes(agentRole);
      }
    }

    return false;
  }

  /**
   * Evaluate numeric conditions (gt, gte, lt, lte)
   */
  private evaluateNumericCondition(
    value: number | undefined,
    condition: any
  ): boolean {
    if (value === undefined) return false;

    if (typeof condition === 'number') {
      return value === condition;
    }

    if (typeof condition === 'object') {
      if (condition.gt !== undefined && value <= condition.gt) return false;
      if (condition.gte !== undefined && value < condition.gte) return false;
      if (condition.lt !== undefined && value >= condition.lt) return false;
      if (condition.lte !== undefined && value > condition.lte) return false;
      return true;
    }

    return false;
  }

  /**
   * Create an RCA result record from analysis
   */
  createRCAResult(
    issueId: string,
    analysis: RCAAnalysisResult,
    analystAgent: string = 'rca-engine'
  ): RCAResult {
    const bestMatch = analysis.best_match;

    return {
      id: randomUUID(),
      issue_id: issueId,
      pattern_id: bestMatch?.pattern.id,
      root_cause: bestMatch?.pattern.root_cause || 'Unknown - no pattern matched',
      confidence: bestMatch?.confidence || 0,
      analysis_method: analysis.analysis_method,
      matched_conditions: bestMatch?.matched_conditions,
      recommended_actions: bestMatch?.recommended_actions,
      metadata: analysis.metadata,
      analyzed_at: analysis.analyzed_at,
      analyst_agent: analystAgent,
    };
  }
}

/**
 * Singleton instance
 */
export const rcaEngine = new RCAEngine();
