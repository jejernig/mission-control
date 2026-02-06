/**
 * Verification Gate Fix Template
 * 
 * Creates a task to add commit verification to the workflow.
 * Applicable when issues indicate missing verification steps or quality problems.
 */

import { FixTemplate, IssueContext, GeneratedFix, ApplicabilityScore } from './base';

export class VerificationGateTemplate extends FixTemplate {
  readonly name = 'Add Verification Gate';
  readonly category = 'verification_gate';
  readonly description = 'Create a task to add commit verification to the workflow';

  calculateApplicability(issue: IssueContext): ApplicabilityScore {
    let score = 0;
    const reasons: string[] = [];

    // Check for verification-related keywords
    const verificationKeywords = [
      'untested', 'no tests', 'missing tests',
      'unverified', 'no verification', 'missing verification',
      'quality', 'lint', 'validation', 'check'
    ];

    const text = `${issue.title} ${issue.description} ${issue.error_message || ''}`.toLowerCase();

    const matchedKeywords = verificationKeywords.filter(keyword => text.includes(keyword));
    if (matchedKeywords.length > 0) {
      score += 0.4;
      reasons.push(`Found verification-related keywords: ${matchedKeywords.join(', ')}`);
    }

    // Check error type
    if (issue.error_type === 'validation' || issue.error_type === 'quality') {
      score += 0.3;
      reasons.push(`Error type indicates verification issue: ${issue.error_type}`);
    }

    // Check source - workflow or pipeline issues benefit from verification gates
    if (issue.source.includes('workflow') || issue.source.includes('pipeline') || issue.source.includes('task')) {
      score += 0.2;
      reasons.push('Issue source is related to workflow/pipeline');
    }

    // Check metadata for workflow-related flags
    if (issue.metadata?.missing_validation || issue.metadata?.workflow_issue) {
      score += 0.1;
      reasons.push('Metadata indicates workflow validation issue');
    }

    return {
      score: Math.min(score, 1.0),
      reason: reasons.length > 0 ? reasons.join('; ') : 'No verification gate indicators found'
    };
  }

  generateFix(issue: IssueContext): GeneratedFix {
    return {
      category: this.category,
      title: 'Add Verification Gate to Workflow',
      description: `Add commit verification gate to prevent issues like: ${issue.title}\n\n` +
        `**Context:** ${issue.description}\n\n` +
        `**Proposed Fix:**\n` +
        `- Add verification gate before commit stage\n` +
        `- Include checks for: code quality, tests, security\n` +
        `- Ensure proper validation before proceeding\n` +
        `- Document verification requirements`,
      action_data: {
        type: 'workflow_enhancement',
        target_stage: 'review',
        verification_checks: ['lint', 'test', 'security_scan'],
        gate_position: 'before_commit',
        issue_reference: issue.id,
        source_issue: {
          id: issue.id,
          title: issue.title,
          severity: issue.severity
        }
      },
      metadata: {
        impact: 8,        // High impact - prevents future issues
        confidence: 0.85, // High confidence - verification gates are proven
        effort: 4,        // Moderate effort - requires workflow changes
        risk: 2           // Low risk - adding checks is safe
      },
      requires_approval: false // Can be auto-applied based on criteria
    };
  }
}
