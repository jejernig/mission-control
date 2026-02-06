/**
 * Task Reassignment Fix Template
 * 
 * Routes task to a different agent, typically one with lower workload or better skills.
 * Applicable when issues indicate agent overload or skill mismatch.
 */

import { FixTemplate, IssueContext, GeneratedFix, ApplicabilityScore } from './base';

export class ReassignmentTemplate extends FixTemplate {
  readonly name = 'Task Reassignment';
  readonly category = 'reassignment';
  readonly description = 'Route task to a different agent with better availability or skills';

  calculateApplicability(issue: IssueContext): ApplicabilityScore {
    let score = 0;
    const reasons: string[] = [];

    // Check for workload/capacity keywords
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

    // Check error type
    if (issue.error_type === 'timeout' || issue.error_type === 'capacity' || issue.error_type === 'skill_mismatch') {
      score += 0.3;
      reasons.push(`Error type suggests reassignment: ${issue.error_type}`);
    }

    // Check for agent-related source
    if (issue.source.includes('agent') || issue.source.includes('worker')) {
      score += 0.2;
      reasons.push('Issue source is agent-related');
    }

    // Check metadata for agent performance indicators
    if (issue.metadata?.agent_overloaded || 
        issue.metadata?.task_timeout || 
        issue.metadata?.high_workload) {
      score += 0.2;
      reasons.push('Metadata indicates agent capacity issue');
    }

    return {
      score: Math.min(score, 1.0),
      reason: reasons.length > 0 ? reasons.join('; ') : 'No reassignment indicators found'
    };
  }

  generateFix(issue: IssueContext): GeneratedFix {
    const reassignmentReason = this.determineReassignmentReason(issue);
    
    return {
      category: this.category,
      title: 'Reassign Task to Available Agent',
      description: `Reassign task to address issue: ${issue.title}\n\n` +
        `**Issue Context:** ${issue.description}\n\n` +
        `**Reassignment Reason:** ${reassignmentReason}\n\n` +
        `**Proposed Actions:**\n` +
        `- Identify agents with lower workload or better matching skills\n` +
        `- Transfer task ownership to selected agent\n` +
        `- Provide context handoff to new agent\n` +
        `- Monitor progress to ensure resolution`,
      action_data: {
        type: 'task_reassignment',
        reassignment_criteria: {
          prefer_lower_workload: true,
          prefer_skill_match: true,
          exclude_original_agent: true
        },
        reason: reassignmentReason,
        issue_reference: issue.id,
        source_issue: {
          id: issue.id,
          title: issue.title,
          severity: issue.severity
        },
        metadata: {
          original_agent: issue.metadata?.assigned_agent || 'unknown',
          workload_factor: issue.metadata?.agent_workload || 'high'
        }
      },
      metadata: {
        impact: 6,        // Moderate impact - improves throughput
        confidence: 0.75, // Good confidence - reassignment usually helps
        effort: 3,        // Low-moderate effort - mainly coordination
        risk: 3           // Moderate risk - context may be lost in transfer
      },
      requires_approval: true // Reassignment should be approved
    };
  }

  private determineReassignmentReason(issue: IssueContext): string {
    const text = `${issue.title} ${issue.description} ${issue.error_message || ''}`.toLowerCase();
    
    if (text.includes('timeout') || text.includes('delayed') || text.includes('stuck')) {
      return 'Current agent appears to be overloaded or blocked. Reassigning to agent with better availability.';
    }
    
    if (text.includes('skill') || text.includes('expertise') || text.includes('unfamiliar')) {
      return 'Task may require different skill set. Reassigning to agent with better matching capabilities.';
    }
    
    if (text.includes('no response') || text.includes('inactive')) {
      return 'Current agent is unresponsive. Reassigning to ensure task progresses.';
    }
    
    return 'Current agent may not be optimal for this task. Reassigning to improve efficiency.';
  }
}
