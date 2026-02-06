/**
 * RCA Statistics API Route
 * GET /api/self-healing/rca/stats
 * 
 * Returns pattern match statistics and unmatched issues
 */

import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import {
  getPatternStats,
  getUnmatchedIssues,
  getFailurePatterns,
} from '@/lib/self-healing/rca-db';

export const dynamic = 'force-dynamic';

const SELF_HEALING_DB = process.env.SELF_HEALING_DB_PATH || 
  './src/lib/self-healing/db/self_healing.db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeUnmatched = searchParams.get('include_unmatched') === 'true';
    const confidenceThreshold = parseFloat(
      searchParams.get('confidence_threshold') || '0.7'
    );

    const db = new Database(SELF_HEALING_DB);

    try {
      // Get pattern statistics
      const patternStats = getPatternStats(db);

      // Get all patterns for context
      const allPatterns = getFailurePatterns(db);

      // Build response
      const response: any = {
        patterns: {
          total: allPatterns.length,
          active: allPatterns.filter((p) => p.is_active).length,
          statistics: patternStats,
        },
        summary: {
          total_matches: patternStats.reduce((sum, p) => sum + p.match_count, 0),
          total_successes: patternStats.reduce((sum, p) => sum + p.success_count, 0),
          average_success_rate:
            patternStats.length > 0
              ? patternStats.reduce((sum, p) => sum + p.success_rate, 0) /
                patternStats.length
              : 0,
        },
      };

      // Optionally include unmatched issues
      if (includeUnmatched) {
        const unmatchedIssues = getUnmatchedIssues(db, confidenceThreshold);
        response.unmatched_issues = {
          count: unmatchedIssues.length,
          confidence_threshold: confidenceThreshold,
          issues: unmatchedIssues,
        };
      }

      db.close();

      return NextResponse.json(response);
    } finally {
      db.close();
    }
  } catch (error) {
    console.error('RCA stats error:', error);
    return NextResponse.json(
      {
        error: 'Failed to retrieve statistics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
