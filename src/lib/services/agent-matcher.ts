/**
 * AgentMatcher Service
 * 
 * Matches tasks to agents based on:
 * - Agent capabilities (domain, layer, skills)
 * - Confidence scores
 * - Historical performance
 * - Current availability
 */

import { getDb } from '../db';
import type { Agent, AgentCapability, TaskAnalysis, AgentMatch } from '../types';

export class AgentMatcher {
  /**
   * Find the best agent matches for a task analysis
   */
  async findMatches(analysis: TaskAnalysis, workspaceId: string, topN: number = 3): Promise<AgentMatch[]> {
    const _db = getDb();

    // Get all agents with capabilities in the workspace
    const agentsWithCapabilities = this.getAgentsWithCapabilities(workspaceId);

    // Score each agent
    const scoredAgents = agentsWithCapabilities.map(agent => {
      const score = this.scoreAgent(agent, analysis);
      return {
        agent: agent.agent,
        confidence: score.confidence,
        reasoning: score.reasoning
      };
    });

    // Sort by confidence and return top N
    return scoredAgents
      .filter(match => match.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, topN);
  }

  /**
   * Get all agents with their capabilities
   */
  private getAgentsWithCapabilities(workspaceId: string): Array<{
    agent: Agent;
    capabilities: AgentCapability[];
  }> {
    const _db = getDb();

    // Get agents in workspace (both workspace-scoped and org-scoped)
    const agents = _db.prepare(`
      SELECT a.*
      FROM agents a
      JOIN workspaces w ON w.id = ?
      WHERE
        (a.scope = 'org' AND a.organization_id = w.organization_id)
        OR
        (a.scope = 'workspace' AND a.workspace_id = ?)
      ORDER BY a.name ASC
    `).all(workspaceId, workspaceId) as Agent[];

    // Get capabilities for each agent
    return agents.map(agent => {
      const capabilities = _db.prepare(`
        SELECT * FROM agent_capabilities
        WHERE agent_id = ?
      `).all(agent.id) as AgentCapability[];

      return { agent, capabilities };
    });
  }

  /**
   * Score an agent against a task analysis
   */
  private scoreAgent(
    agentData: { agent: Agent; capabilities: AgentCapability[] },
    analysis: TaskAnalysis
  ): { confidence: number; reasoning: string } {
    const { agent, capabilities } = agentData;
    
    if (capabilities.length === 0) {
      return {
        confidence: 0,
        reasoning: 'No capabilities defined for this agent'
      };
    }

    let totalScore = 0;
    let matchCount = 0;
    const reasons: string[] = [];

    // Score based on domain match
    const domainMatch = capabilities.find(c => c.domain === analysis.domain);
    if (domainMatch) {
      const domainScore = domainMatch.confidence * 0.4;
      totalScore += domainScore;
      matchCount++;
      reasons.push(`Domain match: ${analysis.domain} (${(domainScore * 100).toFixed(0)}%)`);
    }

    // Score based on layer match
    const layerMatch = capabilities.find(c => c.layer === analysis.layer);
    if (layerMatch) {
      const layerScore = layerMatch.confidence * 0.3;
      totalScore += layerScore;
      matchCount++;
      reasons.push(`Layer match: ${analysis.layer} (${(layerScore * 100).toFixed(0)}%)`);
    }

    // Score based on skill overlap
    for (const capability of capabilities) {
      try {
        const agentSkills = JSON.parse(capability.skills) as string[];
        const skillOverlap = analysis.skills.filter(s => agentSkills.includes(s));
        
        if (skillOverlap.length > 0) {
          const skillScore = (skillOverlap.length / Math.max(analysis.skills.length, 1)) * capability.confidence * 0.3;
          totalScore += skillScore;
          matchCount++;
          reasons.push(`Skills match: ${skillOverlap.join(', ')} (${(skillScore * 100).toFixed(0)}%)`);
        }
      } catch {
        // Invalid JSON in skills, skip
      }
    }

    // Adjust for agent availability
    if (agent.status === 'offline') {
      totalScore *= 0.5;
      reasons.push('Agent currently offline (50% penalty)');
    } else if (agent.status === 'working') {
      totalScore *= 0.8;
      reasons.push('Agent currently working (20% penalty)');
    }

    // Normalize confidence
    const confidence = matchCount > 0 ? Math.min(totalScore, 1.0) : 0;

    return {
      confidence: Math.round(confidence * 100) / 100, // Round to 2 decimals
      reasoning: reasons.length > 0 ? reasons.join('; ') : 'No capability matches found'
    };
  }

  /**
   * Save assignment suggestions to database
   */
  async saveSuggestions(taskId: string, matches: AgentMatch[]): Promise<void> {
    const _db = getDb();

    // Clear existing suggestions for this task
    _db.prepare('DELETE FROM assignment_suggestions WHERE task_id = ?').run(taskId);

    // Insert new suggestions
    const insertStmt = _db.prepare(`
      INSERT INTO assignment_suggestions (id, task_id, agent_id, confidence, reasoning)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const match of matches) {
      const id = `sugg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      insertStmt.run(id, taskId, match.agent.id, match.confidence, match.reasoning);
    }
  }

  /**
   * Get saved suggestions for a task
   */
  async getSuggestions(taskId: string): Promise<AgentMatch[]> {
    const _db = getDb();

    const suggestions = _db.prepare(`
      SELECT 
        s.*,
        a.id as agent_id,
        a.name as agent_name,
        a.role as agent_role,
        a.description as agent_description,
        a.avatar_emoji as agent_avatar_emoji,
        a.status as agent_status,
        a.is_master as agent_is_master,
        a.organization_id as agent_organization_id,
        a.workspace_id as agent_workspace_id,
        a.scope as agent_scope,
        a.created_at as agent_created_at,
        a.updated_at as agent_updated_at
      FROM assignment_suggestions s
      JOIN agents a ON a.id = s.agent_id
      WHERE s.task_id = ?
      ORDER BY s.confidence DESC
    `).all(taskId) as any[];

    return suggestions.map(row => ({
      agent: {
        id: row.agent_id,
        name: row.agent_name,
        role: row.agent_role,
        description: row.agent_description,
        avatar_emoji: row.agent_avatar_emoji,
        status: row.agent_status,
        is_master: Boolean(row.agent_is_master),
        organization_id: row.agent_organization_id,
        workspace_id: row.agent_workspace_id,
        scope: row.agent_scope,
        created_at: row.agent_created_at,
        updated_at: row.agent_updated_at
      },
      confidence: row.confidence,
      reasoning: row.reasoning
    }));
  }

  /**
   * Record assignment history for learning
   */
  async recordAssignment(
    taskId: string,
    agentId: string,
    outcome?: 'success' | 'failure' | 'reassigned',
    metadata?: Record<string, any>
  ): Promise<void> {
    const _db = getDb();

    const id = `hist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    _db.prepare(`
      INSERT INTO assignment_history (id, task_id, agent_id, outcome, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      id,
      taskId,
      agentId,
      outcome || null,
      metadata ? JSON.stringify(metadata) : null
    );
  }
}

// Singleton instance
export const agentMatcher = new AgentMatcher();
