import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// GET /api/tasks/[id]/reviews - Get all reviews for a task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  try {
    const db = getDb();
    const reviews = db.prepare(`
      SELECT 
        r.*,
        a.name as reviewer_name,
        a.avatar_emoji as reviewer_emoji
      FROM task_reviews r
      LEFT JOIN agents a ON r.reviewer_agent_id = a.id
      WHERE r.task_id = ?
      ORDER BY 
        CASE r.review_type
          WHEN 'uat' THEN 1
          WHEN 'security' THEN 2
          WHEN 'quality' THEN 3
          WHEN 'gap' THEN 4
          WHEN 'commit' THEN 5
          WHEN 'pr' THEN 6
        END
    `).all(taskId);

    return NextResponse.json(reviews);
  } catch (error) {
    console.error('Failed to get reviews:', error);
    return NextResponse.json(
      { error: 'Failed to get reviews' },
      { status: 500 }
    );
  }
}

// POST /api/tasks/[id]/reviews - Create or update a review
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  try {
    const body = await request.json();
    const { review_type, reviewer_agent_id, status, notes } = body;

    if (!review_type || !status) {
      return NextResponse.json(
        { error: 'review_type and status are required' },
        { status: 400 }
      );
    }

    const validReviewTypes = ['uat', 'security', 'quality', 'gap', 'commit', 'pr'];
    if (!validReviewTypes.includes(review_type)) {
      return NextResponse.json(
        { error: 'Invalid review_type' },
        { status: 400 }
      );
    }

    const validStatuses = ['pending', 'in_progress', 'passed', 'failed', 'skipped'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    const db = getDb();
    const now = Math.floor(Date.now() / 1000);

    // Check if review already exists
    const existing = db.prepare(
      'SELECT id FROM task_reviews WHERE task_id = ? AND review_type = ?'
    ).get(taskId, review_type) as { id: string } | undefined;

    if (existing) {
      // Update existing review
      const updates: string[] = ['status = ?', 'updated_at = ?'];
      const values: any[] = [status, now];

      if (notes !== undefined) {
        updates.push('notes = ?');
        values.push(notes);
      }

      if (reviewer_agent_id !== undefined) {
        updates.push('reviewer_agent_id = ?');
        values.push(reviewer_agent_id);
      }

      if (status === 'in_progress' && !existing) {
        updates.push('started_at = ?');
        values.push(now);
      }

      if (status === 'passed' || status === 'failed' || status === 'skipped') {
        updates.push('completed_at = ?');
        values.push(now);
      }

      values.push(existing.id);

      db.prepare(
        `UPDATE task_reviews SET ${updates.join(', ')} WHERE id = ?`
      ).run(...values);

      const updated = db.prepare(`
        SELECT 
          r.*,
          a.name as reviewer_name,
          a.avatar_emoji as reviewer_emoji
        FROM task_reviews r
        LEFT JOIN agents a ON r.reviewer_agent_id = a.id
        WHERE r.id = ?
      `).get(existing.id);

      return NextResponse.json(updated);
    } else {
      // Create new review
      const id = uuidv4();
      const startedAt = status === 'in_progress' ? now : null;
      const completedAt = ['passed', 'failed', 'skipped'].includes(status) ? now : null;

      db.prepare(`
        INSERT INTO task_reviews (
          id, task_id, review_type, reviewer_agent_id, status, notes, 
          started_at, completed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        taskId,
        review_type,
        reviewer_agent_id || null,
        status,
        notes || null,
        startedAt,
        completedAt,
        now,
        now
      );

      const created = db.prepare(`
        SELECT 
          r.*,
          a.name as reviewer_name,
          a.avatar_emoji as reviewer_emoji
        FROM task_reviews r
        LEFT JOIN agents a ON r.reviewer_agent_id = a.id
        WHERE r.id = ?
      `).get(id);

      return NextResponse.json(created, { status: 201 });
    }
  } catch (error) {
    console.error('Failed to create/update review:', error);
    return NextResponse.json(
      { error: 'Failed to create/update review' },
      { status: 500 }
    );
  }
}
