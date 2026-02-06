import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { TaskReview, ReviewType, ReviewStatus, Task } from '@/lib/types';

const REVIEW_TYPES: ReviewType[] = ['uat', 'security', 'quality', 'gap', 'commit', 'pr'];

// GET /api/tasks/[id]/reviews - List all reviews for a task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const reviews = queryAll<TaskReview>(
      `SELECT r.*, 
        a.name as reviewer_agent_name,
        a.avatar_emoji as reviewer_agent_emoji
       FROM task_reviews r
       LEFT JOIN agents a ON r.reviewer_agent_id = a.id
       WHERE r.task_id = ?
       ORDER BY CASE r.review_type 
         WHEN 'uat' THEN 1 
         WHEN 'security' THEN 2 
         WHEN 'quality' THEN 3 
         WHEN 'gap' THEN 4 
       END`,
      [id]
    );

    return NextResponse.json(reviews);
  } catch (error) {
    console.error('Failed to fetch reviews:', error);
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 });
  }
}

// POST /api/tasks/[id]/reviews - Initialize reviews for a task (creates pending entries)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Check task exists
    const task = queryOne<Task>('SELECT id FROM tasks WHERE id = ?', [id]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Create pending reviews for all types if they don't exist
    const now = new Date().toISOString();
    for (const reviewType of REVIEW_TYPES) {
      const existing = queryOne<TaskReview>(
        'SELECT id FROM task_reviews WHERE task_id = ? AND review_type = ?',
        [id, reviewType]
      );
      
      if (!existing) {
        run(
          `INSERT INTO task_reviews (id, task_id, review_type, status, created_at)
           VALUES (?, ?, ?, 'pending', ?)`,
          [uuidv4(), id, reviewType, now]
        );
      }
    }

    // Fetch all reviews
    const reviews = queryAll<TaskReview>(
      `SELECT r.*, 
        a.name as reviewer_agent_name,
        a.avatar_emoji as reviewer_agent_emoji
       FROM task_reviews r
       LEFT JOIN agents a ON r.reviewer_agent_id = a.id
       WHERE r.task_id = ?`,
      [id]
    );

    return NextResponse.json(reviews, { status: 201 });
  } catch (error) {
    console.error('Failed to initialize reviews:', error);
    return NextResponse.json({ error: 'Failed to initialize reviews' }, { status: 500 });
  }
}

// PATCH /api/tasks/[id]/reviews - Update a specific review
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { review_type, status, reviewer_agent_id, notes } = body as {
      review_type: ReviewType;
      status: ReviewStatus;
      reviewer_agent_id?: string;
      notes?: string;
    };

    if (!review_type || !REVIEW_TYPES.includes(review_type)) {
      return NextResponse.json({ error: 'Invalid review_type' }, { status: 400 });
    }

    if (!status || !['pending', 'passed', 'failed', 'skipped'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Upsert the review
    const existing = queryOne<TaskReview>(
      'SELECT id FROM task_reviews WHERE task_id = ? AND review_type = ?',
      [id, review_type]
    );

    if (existing) {
      run(
        `UPDATE task_reviews 
         SET status = ?, reviewer_agent_id = ?, notes = ?, reviewed_at = ?
         WHERE task_id = ? AND review_type = ?`,
        [status, reviewer_agent_id || null, notes || null, now, id, review_type]
      );
    } else {
      run(
        `INSERT INTO task_reviews (id, task_id, review_type, status, reviewer_agent_id, notes, reviewed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, review_type, status, reviewer_agent_id || null, notes || null, now, now]
      );
    }

    // Check if all reviews passed → auto-move to done
    const allReviews = queryAll<TaskReview>(
      'SELECT review_type, status FROM task_reviews WHERE task_id = ?',
      [id]
    );

    const allPassed = REVIEW_TYPES.every(type => {
      const review = allReviews.find(r => r.review_type === type);
      return review?.status === 'passed' || review?.status === 'skipped';
    });

    if (allPassed) {
      // Move task to done
      run(
        `UPDATE tasks SET status = 'done', updated_at = ? WHERE id = ?`,
        [now, id]
      );

      // Broadcast task update
      const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
      if (task) {
        broadcast({ type: 'task_updated', payload: task });
      }

      console.log(`[Task ${id}] All reviews passed - moved to done`);
    }

    // If any review failed, move back to in_progress
    const anyFailed = allReviews.some(r => r.status === 'failed');
    if (anyFailed) {
      const currentTask = queryOne<Task>('SELECT status FROM tasks WHERE id = ?', [id]);
      if (currentTask?.status === 'review') {
        run(
          `UPDATE tasks SET status = 'in_progress', updated_at = ? WHERE id = ?`,
          [now, id]
        );
        
        const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
        if (task) {
          broadcast({ type: 'task_updated', payload: task });
        }

        console.log(`[Task ${id}] Review failed - moved back to in_progress`);
      }
    }

    // Fetch updated review
    const review = queryOne<TaskReview>(
      `SELECT r.*, 
        a.name as reviewer_agent_name,
        a.avatar_emoji as reviewer_agent_emoji
       FROM task_reviews r
       LEFT JOIN agents a ON r.reviewer_agent_id = a.id
       WHERE r.task_id = ? AND r.review_type = ?`,
      [id, review_type]
    );

    // Broadcast review update
    broadcast({ type: 'review_updated', payload: { task_id: id, review } });

    return NextResponse.json(review);
  } catch (error) {
    console.error('Failed to update review:', error);
    return NextResponse.json({ error: 'Failed to update review' }, { status: 500 });
  }
}
