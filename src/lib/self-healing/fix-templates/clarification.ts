/**
 * Task Clarification Fix Template
 * 
 * Updates task description with missing requirements and clarifications.
 * Applicable when issues indicate ambiguous or incomplete task specifications.
 */

import { FixTemplate, IssueContext, GeneratedFix, ApplicabilityScore } from './base';

export class ClarificationTemplate extends FixTemplate {
  readonly name = 'Task Clarification';
  readonly category = 'clarification';
  readonly description = 'Update task description with missing requirements and clarifications';

  calculateApplicability(issue: IssueContext): ApplicabilityScore {
    let score = 0;
    const reasons: string[] = [];

    // Check for clarification-related keywords
    const clarificationKeywords = [
      'unclear', 'ambiguous', 'confusing', 'missing requirements',
      'incomplete', 'undefined', 'not specified', 'vague',
      'what should', 'how to', 'missing details', 'need more info'
    ];

    const text = `${issue.title} ${issue.description} ${issue.error_message || ''}`.toLowerCase();

    const matchedKeywords = clarificationKeywords.filter(keyword => text.includes(keyword));
    if (matchedKeywords.length > 0) {
      score += 0.5;
      reasons.push(`Found clarification indicators: ${matchedKeywords.slice(0, 3).join(', ')}`);
    }

    // Check error type
    if (issue.error_type === 'specification' || issue.error_type === 'ambiguity') {
      score += 0.3;
      reasons.push(`Error type indicates clarification needed: ${issue.error_type}`);
    }

    // Check for question marks or uncertainty indicators
    if (text.includes('?') || text.includes('unclear') || text.includes('confused')) {
      score += 0.2;
      reasons.push('Text contains uncertainty indicators');
    }

    // Check metadata
    if (issue.metadata?.needs_clarification || issue.metadata?.incomplete_spec) {
      score += 0.1;
      reasons.push('Metadata flags clarification need');
    }

    return {
      score: Math.min(score, 1.0),
      reason: reasons.length > 0 ? reasons.join('; ') : 'No clarification indicators found'
    };
  }

  generateFix(issue: IssueContext): GeneratedFix {
    // Extract key questions or unclear points from the issue
    const unclearPoints = this.extractUnclearPoints(issue);
    
    return {
      category: this.category,
      title: 'Clarify Task Requirements',
      description: `Clarify requirements for task affected by: ${issue.title}\n\n` +
        `**Issue Context:** ${issue.description}\n\n` +
        `**Points Needing Clarification:**\n${unclearPoints}\n\n` +
        `**Proposed Actions:**\n` +
        `- Review and clarify ambiguous requirements\n` +
        `- Add missing specifications and acceptance criteria\n` +
        `- Update task description with clear, actionable details\n` +
        `- Ensure all stakeholders understand the updated requirements`,
      action_data: {
        type: 'task_update',
        update_target: 'description',
        clarification_points: unclearPoints,
        issue_reference: issue.id,
        suggested_additions: [
          'Detailed acceptance criteria',
          'Edge case specifications',
          'Performance requirements',
          'Integration points'
        ],
        source_issue: {
          id: issue.id,
          title: issue.title,
          severity: issue.severity
        }
      },
      metadata: {
        impact: 7,        // Good impact - prevents confusion and rework
        confidence: 0.9,  // Very high confidence - clarification always helps
        effort: 2,        // Low effort - mainly documentation
        risk: 1           // Very low risk - just adding clarity
      },
      requires_approval: false // Safe to auto-apply
    };
  }

  private extractUnclearPoints(issue: IssueContext): string {
    const points: string[] = [];
    
    // Extract sentences with question marks
    const sentences = issue.description.split(/[.!?]/);
    const questions = sentences.filter(s => s.includes('?') || 
                                           s.toLowerCase().includes('unclear') ||
                                           s.toLowerCase().includes('how to'));
    
    if (questions.length > 0) {
      points.push(...questions.slice(0, 3).map(q => `- ${q.trim()}`));
    } else {
      // Default unclear points based on error type
      points.push(`- Original issue: ${issue.title}`);
      points.push('- Specific requirements and constraints');
      points.push('- Expected behavior and outcomes');
    }
    
    return points.join('\n');
  }
}
