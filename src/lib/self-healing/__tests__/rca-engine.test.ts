/**
 * RCA Engine Tests
 * Test suite for the Root Cause Analysis pattern matching engine
 */

import { describe, test, expect } from '@jest/globals';
import { RCAEngine } from '../rca-engine';
import type { Issue, FailurePattern, RCAAnalysisInput } from '../types';

describe('RCAEngine', () => {
  const engine = new RCAEngine();

  // Sample failure patterns
  const phantomPattern: FailurePattern = {
    id: 'phantom-test',
    name: 'Phantom Implementation',
    signal_type: 'phantom',
    conditions: {
      signal_contains: 'phantom',
      agent_role: { not: 'reviewer' },
      deliverables_empty: true,
    },
    root_cause: 'Agent worked on phantom task',
    recommended_action: 'Reassign to reviewer',
    confidence_weight: 0.9,
    match_count: 0,
    success_count: 0,
    is_active: true,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  const dependencyPattern: FailurePattern = {
    id: 'dependency-test',
    name: 'Stuck - Dependency Wait',
    signal_type: 'stuck_task',
    conditions: {
      activity_contains: 'blocked by',
      status: 'in_progress',
      days_stale: { gte: 2 },
    },
    root_cause: 'Blocked by dependency',
    recommended_action: 'Identify blocker',
    confidence_weight: 0.85,
    match_count: 0,
    success_count: 0,
    is_active: true,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  const overloadPattern: FailurePattern = {
    id: 'overload-test',
    name: 'Agent Overload',
    signal_type: 'stuck_task',
    conditions: {
      agent_active_tasks: { gt: 5 },
      no_recent_activity: true,
      days_since_activity: { gte: 1 },
    },
    root_cause: 'Agent overloaded',
    recommended_action: 'Redistribute tasks',
    confidence_weight: 0.8,
    match_count: 0,
    success_count: 0,
    is_active: true,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  describe('Pattern Matching', () => {
    test('should match phantom implementation pattern', async () => {
      const issue: Issue = {
        id: 'issue-1',
        title: 'Task completed but phantom implementation',
        description: 'Agent marked task done with no deliverables',
        severity: 'high',
        status: 'detected',
        source: 'task-monitor',
        detected_at: Date.now(),
        updated_at: Date.now(),
      };

      const input: RCAAnalysisInput = {
        issue,
        task_data: {
          id: 'task-1',
          status: 'in_progress',
          agent_role: 'worker',
          deliverables_count: 0,
        },
      };

      const result = await engine.analyzeIssue(input, [phantomPattern]);

      expect(result.matches).toHaveLength(1);
      expect(result.best_match?.pattern.id).toBe('phantom-test');
      expect(result.best_match?.confidence).toBeGreaterThan(0.7);
      expect(result.best_match?.matched_conditions).toHaveProperty('signal_contains', true);
      expect(result.best_match?.matched_conditions).toHaveProperty('agent_role', true);
      expect(result.best_match?.matched_conditions).toHaveProperty('deliverables_empty', true);
    });

    test('should NOT match phantom pattern when agent is reviewer', async () => {
      const issue: Issue = {
        id: 'issue-2',
        title: 'Task completed with phantom mention',
        severity: 'medium',
        status: 'detected',
        source: 'task-monitor',
        detected_at: Date.now(),
        updated_at: Date.now(),
      };

      const input: RCAAnalysisInput = {
        issue,
        task_data: {
          id: 'task-2',
          status: 'in_progress',
          agent_role: 'reviewer', // This should prevent match
          deliverables_count: 0,
        },
      };

      const result = await engine.analyzeIssue(input, [phantomPattern]);

      expect(result.matches).toHaveLength(0);
      expect(result.best_match).toBeUndefined();
    });

    test('should match dependency wait pattern', async () => {
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

      const issue: Issue = {
        id: 'issue-3',
        title: 'Task stuck for 3 days',
        severity: 'medium',
        status: 'detected',
        source: 'task-monitor',
        detected_at: threeDaysAgo,
        updated_at: Date.now(),
      };

      const input: RCAAnalysisInput = {
        issue,
        task_data: {
          id: 'task-3',
          status: 'in_progress',
          activity_text: 'Task is blocked by upstream service deployment',
        },
      };

      const result = await engine.analyzeIssue(input, [dependencyPattern]);

      expect(result.matches).toHaveLength(1);
      expect(result.best_match?.pattern.id).toBe('dependency-test');
      expect(result.best_match?.matched_conditions).toHaveProperty('activity_contains', true);
      expect(result.best_match?.matched_conditions).toHaveProperty('status', true);
      expect(result.best_match?.matched_conditions).toHaveProperty('days_stale', true);
    });

    test('should match agent overload pattern', async () => {
      const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;

      const issue: Issue = {
        id: 'issue-4',
        title: 'Task has no recent activity',
        severity: 'high',
        status: 'detected',
        source: 'task-monitor',
        detected_at: Date.now(),
        updated_at: Date.now(),
      };

      const input: RCAAnalysisInput = {
        issue,
        task_data: {
          id: 'task-4',
          status: 'in_progress',
          agent_active_task_count: 8,
          last_activity_at: twoDaysAgo,
        },
      };

      const result = await engine.analyzeIssue(input, [overloadPattern]);

      expect(result.matches).toHaveLength(1);
      expect(result.best_match?.pattern.id).toBe('overload-test');
      expect(result.best_match?.matched_conditions).toHaveProperty('agent_active_tasks', true);
      expect(result.best_match?.matched_conditions).toHaveProperty('no_recent_activity', true);
      expect(result.best_match?.matched_conditions).toHaveProperty('days_since_activity', true);
    });

    test('should return multiple matches sorted by confidence', async () => {
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;

      const issue: Issue = {
        id: 'issue-5',
        title: 'Task stuck - blocked by dependency',
        severity: 'high',
        status: 'detected',
        source: 'task-monitor',
        detected_at: threeDaysAgo,
        updated_at: Date.now(),
      };

      const input: RCAAnalysisInput = {
        issue,
        task_data: {
          id: 'task-5',
          status: 'in_progress',
          activity_text: 'Waiting - blocked by upstream task',
          agent_active_task_count: 6,
          last_activity_at: twoDaysAgo,
        },
      };

      const result = await engine.analyzeIssue(input, [
        dependencyPattern,
        overloadPattern,
      ]);

      expect(result.matches.length).toBeGreaterThan(0);
      // Should be sorted by confidence
      for (let i = 1; i < result.matches.length; i++) {
        expect(result.matches[i - 1].confidence).toBeGreaterThanOrEqual(
          result.matches[i].confidence
        );
      }
    });

    test('should handle no matches gracefully', async () => {
      const issue: Issue = {
        id: 'issue-6',
        title: 'Unrelated issue',
        severity: 'low',
        status: 'detected',
        source: 'test',
        detected_at: Date.now(),
        updated_at: Date.now(),
      };

      const input: RCAAnalysisInput = {
        issue,
        task_data: {
          id: 'task-6',
          status: 'done',
          deliverables_count: 5,
        },
      };

      const result = await engine.analyzeIssue(input, [
        phantomPattern,
        dependencyPattern,
        overloadPattern,
      ]);

      expect(result.matches).toHaveLength(0);
      expect(result.best_match).toBeUndefined();
      expect(result.analysis_method).toBe('pattern_match');
    });

    test('should filter inactive patterns', async () => {
      const inactivePattern: FailurePattern = {
        ...phantomPattern,
        id: 'inactive-test',
        is_active: false,
      };

      const issue: Issue = {
        id: 'issue-7',
        title: 'Task completed but phantom implementation',
        severity: 'high',
        status: 'detected',
        source: 'task-monitor',
        detected_at: Date.now(),
        updated_at: Date.now(),
      };

      const input: RCAAnalysisInput = {
        issue,
        task_data: {
          id: 'task-7',
          status: 'in_progress',
          agent_role: 'worker',
          deliverables_count: 0,
        },
      };

      const result = await engine.analyzeIssue(input, [inactivePattern]);

      expect(result.matches).toHaveLength(0);
    });

    test('should complete analysis in sub-second time', async () => {
      const issue: Issue = {
        id: 'issue-8',
        title: 'Performance test',
        severity: 'low',
        status: 'detected',
        source: 'test',
        detected_at: Date.now(),
        updated_at: Date.now(),
      };

      const input: RCAAnalysisInput = {
        issue,
        task_data: {
          id: 'task-8',
          status: 'in_progress',
        },
      };

      const patterns = [phantomPattern, dependencyPattern, overloadPattern];

      const startTime = Date.now();
      const result = await engine.analyzeIssue(input, patterns);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000); // Sub-second
      expect(result.metadata?.analysis_time_ms).toBeLessThan(1000);
    });
  });

  describe('RCA Result Creation', () => {
    test('should create RCA result from analysis with match', async () => {
      const issue: Issue = {
        id: 'issue-9',
        title: 'Test issue',
        severity: 'medium',
        status: 'detected',
        source: 'test',
        detected_at: Date.now(),
        updated_at: Date.now(),
      };

      const input: RCAAnalysisInput = {
        issue,
        task_data: {
          id: 'task-9',
          status: 'in_progress',
          agent_role: 'worker',
          deliverables_count: 0,
        },
      };

      const analysis = await engine.analyzeIssue(input, [phantomPattern]);
      const rcaResult = engine.createRCAResult('issue-9', analysis);

      expect(rcaResult.id).toBeDefined();
      expect(rcaResult.issue_id).toBe('issue-9');
      expect(rcaResult.pattern_id).toBe(phantomPattern.id);
      expect(rcaResult.root_cause).toBe(phantomPattern.root_cause);
      expect(rcaResult.confidence).toBeGreaterThan(0);
      expect(rcaResult.analysis_method).toBe('pattern_match');
      expect(rcaResult.analyst_agent).toBe('rca-engine');
    });

    test('should create RCA result from analysis without match', async () => {
      const issue: Issue = {
        id: 'issue-10',
        title: 'No match test',
        severity: 'low',
        status: 'detected',
        source: 'test',
        detected_at: Date.now(),
        updated_at: Date.now(),
      };

      const input: RCAAnalysisInput = {
        issue,
      };

      const analysis = await engine.analyzeIssue(input, [phantomPattern]);
      const rcaResult = engine.createRCAResult('issue-10', analysis);

      expect(rcaResult.id).toBeDefined();
      expect(rcaResult.issue_id).toBe('issue-10');
      expect(rcaResult.pattern_id).toBeUndefined();
      expect(rcaResult.root_cause).toBe('Unknown - no pattern matched');
      expect(rcaResult.confidence).toBe(0);
    });
  });
});
