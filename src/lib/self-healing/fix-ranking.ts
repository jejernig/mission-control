/**
 * Fix Ranking Engine
 * 
 * Ranks potential fixes based on impact, confidence, effort, and risk.
 * Formula: score = (impact × confidence) / (effort × risk)
 */

import { IssueContext, GeneratedFix, FixTemplate } from './fix-templates';
import { FIX_TEMPLATES } from './fix-templates';

export interface RankedFix extends GeneratedFix {
  template_name: string;
  applicability_score: number;
  applicability_reason: string;
  ranking_score: number;
  ranking_details: {
    impact: number;
    confidence: number;
    effort: number;
    risk: number;
    formula: string;
  };
}

export interface FixRankingOptions {
  applicability_threshold?: number;  // Minimum applicability score (default: 0.3)
  top_n?: number;                     // Number of top fixes to return (default: 3)
  include_zero_score?: boolean;       // Include fixes with 0 ranking score (default: false)
}

/**
 * Calculate ranking score for a fix
 * Formula: score = (impact × confidence) / (effort × risk)
 */
export function calculateRankingScore(fix: GeneratedFix): number {
  const { impact, confidence, effort, risk } = fix.metadata;
  
  // Prevent division by zero
  const denominator = Math.max(effort * risk, 0.1);
  
  const score = (impact * confidence) / denominator;
  
  return Math.round(score * 100) / 100; // Round to 2 decimal places
}

/**
 * Determine if a fix should be auto-applied
 * Criteria: score > 8, risk ≤ 3, confidence ≥ 0.8, category in [clarification, verification_gate]
 */
export function shouldAutoApply(rankedFix: RankedFix): boolean {
  const { ranking_score, category, metadata } = rankedFix;
  const { risk, confidence } = metadata;
  
  const autoApplyCategories = ['clarification', 'verification_gate'];
  
  return (
    ranking_score > 8 &&
    risk <= 3 &&
    confidence >= 0.8 &&
    autoApplyCategories.includes(category)
  );
}

/**
 * Rank all applicable fixes for an issue
 * Returns top N fixes sorted by ranking score
 */
export function rankFixes(
  issue: IssueContext,
  options: FixRankingOptions = {}
): RankedFix[] {
  const {
    applicability_threshold = 0.3,
    top_n = 3,
    include_zero_score = false
  } = options;

  const rankedFixes: RankedFix[] = [];

  // Evaluate each template
  for (const template of FIX_TEMPLATES) {
    // Calculate applicability
    const applicability = template.calculateApplicability(issue);
    
    // Skip if below threshold
    if (applicability.score < applicability_threshold) {
      continue;
    }

    // Generate the fix
    const fix = template.generateFix(issue);
    
    // Calculate ranking score
    const ranking_score = calculateRankingScore(fix);
    
    // Skip zero-score fixes unless explicitly requested
    if (ranking_score === 0 && !include_zero_score) {
      continue;
    }

    // Create ranked fix
    const rankedFix: RankedFix = {
      ...fix,
      template_name: template.name,
      applicability_score: applicability.score,
      applicability_reason: applicability.reason,
      ranking_score,
      ranking_details: {
        impact: fix.metadata.impact,
        confidence: fix.metadata.confidence,
        effort: fix.metadata.effort,
        risk: fix.metadata.risk,
        formula: `(${fix.metadata.impact} × ${fix.metadata.confidence}) / (${fix.metadata.effort} × ${fix.metadata.risk}) = ${ranking_score}`
      }
    };

    rankedFixes.push(rankedFix);
  }

  // Sort by ranking score (descending), then by applicability (descending)
  rankedFixes.sort((a, b) => {
    if (b.ranking_score !== a.ranking_score) {
      return b.ranking_score - a.ranking_score;
    }
    return b.applicability_score - a.applicability_score;
  });

  // Return top N
  return rankedFixes.slice(0, top_n);
}

/**
 * Get the best fix for auto-application (if any)
 * Returns the highest-ranked fix that meets auto-apply criteria, or null
 */
export function getBestAutoApplyFix(issue: IssueContext): RankedFix | null {
  const rankedFixes = rankFixes(issue, { top_n: 5 });
  
  // Find first fix that meets auto-apply criteria
  const autoApplyFix = rankedFixes.find(shouldAutoApply);
  
  return autoApplyFix || null;
}

/**
 * Generate a human-readable summary of fix rankings
 */
export function generateRankingSummary(rankedFixes: RankedFix[]): string {
  if (rankedFixes.length === 0) {
    return 'No applicable fixes found.';
  }

  const lines = ['## Fix Rankings\n'];
  
  rankedFixes.forEach((fix, index) => {
    lines.push(`### ${index + 1}. ${fix.title} (Score: ${fix.ranking_score})`);
    lines.push(`**Category:** ${fix.category}`);
    lines.push(`**Template:** ${fix.template_name}`);
    lines.push(`**Applicability:** ${(fix.applicability_score * 100).toFixed(0)}% - ${fix.applicability_reason}`);
    lines.push(`**Ranking:** ${fix.ranking_details.formula}`);
    lines.push(`**Auto-apply:** ${shouldAutoApply(fix) ? 'Yes ✓' : 'No - Requires approval'}`);
    lines.push('');
  });

  return lines.join('\n');
}
