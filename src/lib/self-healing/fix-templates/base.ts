/**
 * Base Fix Template
 * 
 * Abstract base class for all fix templates. Provides:
 * - Applicability scoring (how well this fix matches the issue)
 * - Fix generation (creates the fix data structure)
 * - Metadata about impact, confidence, effort, and risk
 */

export interface IssueContext {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  source: string;
  error_type?: string;
  error_message?: string;
  metadata?: Record<string, any>;
}

export interface FixMetadata {
  impact: number;      // 1-10: How much this fix will improve the situation
  confidence: number;  // 0-1: How confident we are this fix will work
  effort: number;      // 1-10: How much effort/resources needed
  risk: number;        // 1-10: How risky is applying this fix
}

export interface GeneratedFix {
  category: string;
  title: string;
  description: string;
  action_data: Record<string, any>;
  metadata: FixMetadata;
  requires_approval: boolean;
}

export interface ApplicabilityScore {
  score: number;      // 0-1: How applicable this template is to the issue
  reason: string;     // Human-readable explanation
}

export abstract class FixTemplate {
  abstract readonly name: string;
  abstract readonly category: string;
  abstract readonly description: string;

  /**
   * Determine if this fix template is applicable to the given issue
   * Returns a score from 0-1, where 1 means highly applicable
   */
  abstract calculateApplicability(issue: IssueContext): ApplicabilityScore;

  /**
   * Generate the fix for this issue
   * Only called if applicability score is above threshold
   */
  abstract generateFix(issue: IssueContext): GeneratedFix;

  /**
   * Default risk assessment - can be overridden
   */
  protected assessRisk(issue: IssueContext): number {
    // Default risk based on severity
    const riskMap: Record<string, number> = {
      'critical': 5,
      'high': 4,
      'medium': 3,
      'low': 2,
      'info': 1
    };
    return riskMap[issue.severity] || 3;
  }
}
