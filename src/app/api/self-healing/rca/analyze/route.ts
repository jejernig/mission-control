/**
 * RCA Analysis API Route
 * POST /api/self-healing/rca/analyze
 * 
 * Analyzes an issue using the RCA pattern matching engine
 */

import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { rcaEngine } from '@/lib/self-healing/rca-engine';
import {
  getFailurePatterns,
  createRCAResult,
  updatePatternStats,
} from '@/lib/self-healing/rca-db';
import type { Issue, RCAAnalysisInput } from '@/lib/self-healing/types';

const SELF_HEALING_DB = process.env.SELF_HEALING_DB_PATH || 
  './src/lib/self-healing/db/self_healing.db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { issue, task_data, signal_type } = body as {
      issue: Issue;
      task_data?: RCAAnalysisInput['task_data'];
      signal_type?: string;
    };

    if (!issue || !issue.id) {
      return NextResponse.json(
        { error: 'Issue data is required' },
        { status: 400 }
      );
    }

    // Open database connection
    const db = new Database(SELF_HEALING_DB);

    try {
      // Get relevant failure patterns
      const patterns = getFailurePatterns(db, signal_type);

      if (patterns.length === 0) {
        return NextResponse.json(
          {
            message: 'No active patterns found',
            patterns_evaluated: 0,
          },
          { status: 200 }
        );
      }

      // Analyze the issue
      const input: RCAAnalysisInput = { issue, task_data };
      const analysis = await rcaEngine.analyzeIssue(input, patterns);

      // Create RCA result
      const rcaResult = rcaEngine.createRCAResult(
        issue.id,
        analysis,
        'rca-api'
      );

      // Save to database
      createRCAResult(db, rcaResult);

      // Update pattern statistics if matched
      if (rcaResult.pattern_id) {
        updatePatternStats(db, rcaResult.pattern_id, false);
      }

      db.close();

      return NextResponse.json({
        success: true,
        result: {
          id: rcaResult.id,
          issue_id: rcaResult.issue_id,
          pattern_id: rcaResult.pattern_id,
          root_cause: rcaResult.root_cause,
          confidence: rcaResult.confidence,
          recommended_actions: rcaResult.recommended_actions,
        },
        analysis: {
          patterns_evaluated: analysis.metadata?.patterns_evaluated || 0,
          patterns_matched: analysis.metadata?.patterns_matched || 0,
          analysis_time_ms: analysis.metadata?.analysis_time_ms || 0,
          best_match: analysis.best_match
            ? {
                pattern_name: analysis.best_match.pattern.name,
                confidence: analysis.best_match.confidence,
                matched_conditions: analysis.best_match.matched_conditions,
              }
            : null,
        },
      });
    } finally {
      db.close();
    }
  } catch (error) {
    console.error('RCA analysis error:', error);
    return NextResponse.json(
      {
        error: 'Failed to analyze issue',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
