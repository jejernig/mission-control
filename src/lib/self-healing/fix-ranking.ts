import { IssueContext, GeneratedFix } from './fix-templates';
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
  applicability_threshold?: number;
  top_n?: number;
  include_zero_score?: boolean;
}

export function calculateRankingScore(fix: GeneratedFix): number {
  const { impact, confidence, effort, risk } = fix.metadata;
  const denominator = Math.max(effort * risk, 0.1);
  const score = (impact * confidence) / denominator;
  return Math.round(score * 100) / 100;
}

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

  for (const template of FIX_TEMPLATES) {
    const applicability = template.calculateApplicability(issue);
    
    if (applicability.score < applicability_threshold) {
      continue;
    }

    const fix = template.generateFix(issue);
    const ranking_score = calculateRankingScore(fix);
    
    if (ranking_score === 0 && !include_zero_score) {
      continue;
    }

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

  rankedFixes.sort((a, b) => {
    if (b.ranking_score !== a.ranking_score) {
      return b.ranking_score - a.ranking_score;
    }
    return b.applicability_score - a.applicability_score;
  });

  return rankedFixes.slice(0, top_n);
}

export function getBestAutoApplyFix(issue: IssueContext): RankedFix | null {
  const rankedFixes = rankFixes(issue, { top_n: 5 });
  const autoApplyFix = rankedFixes.find(shouldAutoApply);
  return autoApplyFix || null;
}
