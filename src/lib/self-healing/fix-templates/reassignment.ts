/**
 * Task Reassignment Fix Template
 */

import { FixTemplate, IssueContext, GeneratedFix, ApplicabilityScore } from './base';

export class ReassignmentTemplate extends FixTemplate {
  readonly name = 'Task Reassignment';
  readonly category = 'reassignment';
  readonly description = 'Route task to a different agent with better availability or skills';

  calculateApplicability(issue: IssueContext): ApplicabilityScore {
    let score = 0;
    const reasons: string[] = [];

    const workloadKeywords = [
      'overloaded', 'busy', 'timeout', 'delayed', 'stuck',
      'no response', 'too many tasks', 'capacity', 'bottleneck'
    ];

    const text = `${issue.title} ${issue.description} ${issue.error_message || ''}`.toLowerCase();

    const matchedKeywords = workloadKeywords.filter(keyword => text.includes(keyword));
    if (matchedKeywords.length > 0) {
      score += 0.4;
      reasons.push(`Found workload indicators: ${matchedKeywords.join(', ')}`);
    }

    if (issue.error_type === 'timeout' || issue.error_type === 'capacity') {
      score += 0.3;
      reasons.push(`Error type suggests reassignment: ${issue.error_type}`);
    }

    if (issue.source.includes('agent') || issue.source.includes('worker')) {
      score += 0.2;
      reasons.push('Issue source is agent-related');
    }

    if (issue.metadata?.agent_overloaded || issue.metadata?.task_timeout) {
      score += 0.2;
      reasons.push('Metadata indicates agent capacity issue');
    }

    return {
      score: Math.min(score, 1.0),
      reason: reasons.length > 0 ? reasons.join('; ') : 'No reassignment indicators found'
    };
  }

  generateFix(issue: IssueContext): GeneratedFix {
    return {
      category: this.category,
      title: 'Reassign Task to Available Agent',
      description: `Reassign task to address issue: ${issue.title}`,
      action_data: {
        type: 'task_reassignment',
        reassignment_criteria: {
          prefer_lower_workload: true,
          prefer_skill_match: true
        },
        issue_reference: issue.id
      },
      metadata: {
        impact: 6,
        confidence: 0.75,
        effort: 3,
        risk: 3
      },
      requires_approval: true
    };
  }
}
