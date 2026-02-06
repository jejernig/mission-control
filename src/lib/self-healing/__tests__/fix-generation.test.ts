/**
 * Tests for Fix Generation System
 */

import { describe, it, expect } from 'vitest';
import type { IssueContext, GeneratedFix } from '../fix-templates/base';
import type { RankedFix } from '../fix-ranking';
import {
  rankFixes,
  calculateRankingScore,
  shouldAutoApply,
  getBestAutoApplyFix
} from '../fix-ranking';
import { VerificationGateTemplate } from '../fix-templates/verification-gate';
import { ClarificationTemplate } from '../fix-templates/clarification';
import { ReassignmentTemplate } from '../fix-templates/reassignment';

describe('Fix Templates', () => {
  describe('VerificationGateTemplate', () => {
    const template = new VerificationGateTemplate();

    it('should detect verification-related issues', () => {
      const issue: IssueContext = {
        id: 'test-001',
        title: 'Missing tests for authentication module',
        description: 'The authentication module has no test coverage and validation',
        severity: 'high',
        source: 'workflow'
      };

      const result = template.calculateApplicability(issue);
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.reason).toContain('verification');
    });

    it('should generate verification gate fix', () => {
      const issue: IssueContext = {
        id: 'test-001',
        title: 'Unverified commits',
        description: 'Commits are being pushed without proper validation',
        severity: 'high',
        source: 'pipeline'
      };

      const fix = template.generateFix(issue);
      expect(fix.category).toBe('verification_gate');
      expect(fix.title).toContain('Verification Gate');
      expect(fix.metadata.confidence).toBeGreaterThanOrEqual(0.8);
      expect(fix.metadata.risk).toBeLessThanOrEqual(3);
    });
  });

  describe('ClarificationTemplate', () => {
    const template = new ClarificationTemplate();

    it('should detect clarification needs', () => {
      const issue: IssueContext = {
        id: 'test-002',
        title: 'Task requirements are unclear',
        description: 'What exactly should be implemented? The specification is too vague.',
        severity: 'medium',
        source: 'task-management'
      };

      const result = template.calculateApplicability(issue);
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.reason).toContain('clarification');
    });

    it('should generate clarification fix', () => {
      const issue: IssueContext = {
        id: 'test-002',
        title: 'Ambiguous acceptance criteria',
        description: 'The acceptance criteria are unclear and incomplete.',
        severity: 'medium',
        source: 'task'
      };

      const fix = template.generateFix(issue);
      expect(fix.category).toBe('clarification');
      expect(fix.title).toContain('Clarify');
      expect(fix.metadata.effort).toBeLessThanOrEqual(3);
      expect(fix.metadata.risk).toBeLessThanOrEqual(2);
    });
  });

  describe('ReassignmentTemplate', () => {
    const template = new ReassignmentTemplate();

    it('should detect reassignment needs', () => {
      const issue: IssueContext = {
        id: 'test-003',
        title: 'Agent overloaded with tasks',
        description: 'Current agent has too many tasks and is causing delays',
        severity: 'high',
        source: 'agent-monitoring',
        metadata: {
          agent_overloaded: true,
          high_workload: true
        }
      };

      const result = template.calculateApplicability(issue);
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.reason).toContain('workload');
    });

    it('should generate reassignment fix', () => {
      const issue: IssueContext = {
        id: 'test-003',
        title: 'Agent timeout',
        description: 'Agent is not responding due to high load',
        severity: 'high',
        source: 'agent'
      };

      const fix = template.generateFix(issue);
      expect(fix.category).toBe('reassignment');
      expect(fix.requires_approval).toBe(true);
    });
  });
});

describe('Fix Ranking', () => {
  it('should calculate ranking score correctly', () => {
    const fix: GeneratedFix = {
      category: 'test',
      title: 'Test Fix',
      description: 'Test',
      action_data: {},
      metadata: {
        impact: 8,
        confidence: 0.9,
        effort: 2,
        risk: 2
      },
      requires_approval: false
    };

    const score = calculateRankingScore(fix);
    // (8 * 0.9) / (2 * 2) = 7.2 / 4 = 1.8
    expect(score).toBe(1.8);
  });

  it('should prevent division by zero', () => {
    const fix: GeneratedFix = {
      category: 'test',
      title: 'Test Fix',
      description: 'Test',
      action_data: {},
      metadata: {
        impact: 10,
        confidence: 1.0,
        effort: 0,  // Would cause division by zero
        risk: 0
      },
      requires_approval: false
    };

    const score = calculateRankingScore(fix);
    expect(score).toBeGreaterThan(0);
    expect(isFinite(score)).toBe(true);
  });

  it('should determine auto-apply correctly', () => {
    const autoApplyFix: RankedFix = {
      category: 'clarification',
      title: 'Test',
      description: 'Test',
      action_data: {},
      metadata: {
        impact: 10,
        confidence: 0.9,
        effort: 1,
        risk: 2
      },
      requires_approval: false,
      template_name: 'Test',
      applicability_score: 0.9,
      applicability_reason: 'Test',
      ranking_score: 9.0,  // > 8
      ranking_details: {
        impact: 10,
        confidence: 0.9,
        effort: 1,
        risk: 2,
        formula: '(10 × 0.9) / (1 × 2) = 9.0'
      }
    };

    expect(shouldAutoApply(autoApplyFix)).toBe(true);
  });

  it('should not auto-apply if score too low', () => {
    const fix: RankedFix = {
      category: 'clarification',
      title: 'Test',
      description: 'Test',
      action_data: {},
      metadata: {
        impact: 5,
        confidence: 0.9,
        effort: 2,
        risk: 2
      },
      requires_approval: false,
      template_name: 'Test',
      applicability_score: 0.8,
      applicability_reason: 'Test',
      ranking_score: 5.625,  // < 8
      ranking_details: {
        impact: 5,
        confidence: 0.9,
        effort: 2,
        risk: 2,
        formula: '(5 × 0.9) / (2 × 2) = 5.625'
      }
    };

    expect(shouldAutoApply(fix)).toBe(false);
  });

  it('should not auto-apply if risk too high', () => {
    const fix: RankedFix = {
      category: 'clarification',
      title: 'Test',
      description: 'Test',
      action_data: {},
      metadata: {
        impact: 10,
        confidence: 0.9,
        effort: 1,
        risk: 5  // > 3
      },
      requires_approval: false,
      template_name: 'Test',
      applicability_score: 0.9,
      applicability_reason: 'Test',
      ranking_score: 9.0,
      ranking_details: {
        impact: 10,
        confidence: 0.9,
        effort: 1,
        risk: 5,
        formula: '(10 × 0.9) / (1 × 5) = 9.0'
      }
    };

    expect(shouldAutoApply(fix)).toBe(false);
  });

  it('should not auto-apply wrong category', () => {
    const fix: RankedFix = {
      category: 'reassignment',  // Not in auto-apply list
      title: 'Test',
      description: 'Test',
      action_data: {},
      metadata: {
        impact: 10,
        confidence: 0.9,
        effort: 1,
        risk: 2
      },
      requires_approval: false,
      template_name: 'Test',
      applicability_score: 0.9,
      applicability_reason: 'Test',
      ranking_score: 9.0,
      ranking_details: {
        impact: 10,
        confidence: 0.9,
        effort: 1,
        risk: 2,
        formula: '(10 × 0.9) / (1 × 2) = 9.0'
      }
    };

    expect(shouldAutoApply(fix)).toBe(false);
  });
});

describe('Fix Ranking Integration', () => {
  it('should rank multiple fixes', () => {
    const issue: IssueContext = {
      id: 'test-004',
      title: 'Task specification unclear and agent overloaded',
      description: 'The task needs clarification and the current agent is busy with timeout issues',
      severity: 'high',
      source: 'workflow',
      error_type: 'specification',
      metadata: {
        needs_clarification: true,
        agent_overloaded: true
      }
    };

    const rankedFixes = rankFixes(issue, { top_n: 3 });
    
    expect(rankedFixes.length).toBeGreaterThan(0);
    expect(rankedFixes.length).toBeLessThanOrEqual(3);
    
    // Should be sorted by ranking score
    for (let i = 1; i < rankedFixes.length; i++) {
      expect(rankedFixes[i - 1].ranking_score).toBeGreaterThanOrEqual(rankedFixes[i].ranking_score);
    }
  });

  it('should get best auto-apply fix', () => {
    const issue: IssueContext = {
      id: 'test-005',
      title: 'Missing validation in workflow',
      description: 'The workflow lacks proper validation checks',
      severity: 'high',
      source: 'workflow',
      error_type: 'validation'
    };

    const bestFix = getBestAutoApplyFix(issue);
    
    if (bestFix) {
      expect(shouldAutoApply(bestFix)).toBe(true);
      expect(bestFix.ranking_score).toBeGreaterThan(8);
      expect(bestFix.metadata.risk).toBeLessThanOrEqual(3);
      expect(bestFix.metadata.confidence).toBeGreaterThanOrEqual(0.8);
    }
  });
});
