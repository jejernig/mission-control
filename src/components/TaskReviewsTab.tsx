'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, MinusCircle, RefreshCw } from 'lucide-react';
import type { TaskReview, ReviewType, ReviewStatus } from '@/lib/types';

interface TaskReviewsTabProps {
  taskId: string;
}

const reviewConfig: Record<ReviewType, { label: string; emoji: string; description: string }> = {
  uat: { label: 'UAT Testing', emoji: '🧪', description: 'User acceptance testing' },
  security: { label: 'Security Review', emoji: '🔒', description: 'Security vulnerability check' },
  quality: { label: 'Quality Review', emoji: '✨', description: 'Code quality standards' },
  gap: { label: 'Gap Analysis', emoji: '🔍', description: 'Completeness check' },
  commit: { label: 'Committed', emoji: '📝', description: 'Code committed to git' },
  pr: { label: 'Pull Request', emoji: '🔀', description: 'PR created/merged' },
};

const statusConfig: Record<ReviewStatus, { icon: React.ReactNode; color: string; bgColor: string }> = {
  passed: { icon: <CheckCircle2 className="w-5 h-5" />, color: 'text-green-400', bgColor: 'bg-green-400/10' },
  failed: { icon: <XCircle className="w-5 h-5" />, color: 'text-red-400', bgColor: 'bg-red-400/10' },
  pending: { icon: <Clock className="w-5 h-5" />, color: 'text-yellow-400', bgColor: 'bg-yellow-400/10' },
  skipped: { icon: <MinusCircle className="w-5 h-5" />, color: 'text-gray-400', bgColor: 'bg-gray-400/10' },
};

const REVIEW_ORDER: ReviewType[] = ['uat', 'security', 'quality', 'gap', 'commit', 'pr'];

export function TaskReviewsTab({ taskId }: TaskReviewsTabProps) {
  const [reviews, setReviews] = useState<TaskReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);

  async function fetchReviews() {
    try {
      const res = await fetch(`/api/tasks/${taskId}/reviews`);
      if (res.ok) {
        setReviews(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    } finally {
      setLoading(false);
    }
  }

  async function initializeReviews() {
    setInitializing(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/reviews`, { method: 'POST' });
      if (res.ok) {
        setReviews(await res.json());
      }
    } catch (error) {
      console.error('Failed to initialize reviews:', error);
    } finally {
      setInitializing(false);
    }
  }

  useEffect(() => {
    fetchReviews();
  }, [taskId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-mc-text-secondary">
        Loading reviews...
      </div>
    );
  }

  // Calculate summary
  const passed = reviews.filter(r => r.status === 'passed' || r.status === 'skipped').length;
  const failed = reviews.filter(r => r.status === 'failed').length;
  const pending = reviews.filter(r => r.status === 'pending').length;
  const total = REVIEW_ORDER.length;
  const allPassed = passed === total && failed === 0;

  // Build review map for display
  const reviewMap = new Map(reviews.map(r => [r.review_type, r]));

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-green-400">✓ {passed} passed</span>
          {failed > 0 && <span className="text-red-400">✗ {failed} failed</span>}
          {pending > 0 && <span className="text-yellow-400">⏳ {pending} pending</span>}
        </div>
        {reviews.length === 0 && (
          <button
            onClick={initializeReviews}
            disabled={initializing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-mc-accent hover:bg-mc-accent-hover rounded disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${initializing ? 'animate-spin' : ''}`} />
            Initialize Reviews
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-mc-bg-tertiary rounded-full h-3 overflow-hidden flex">
        <div
          className="bg-green-500 h-full transition-all"
          style={{ width: `${(passed / total) * 100}%` }}
        />
        <div
          className="bg-red-500 h-full transition-all"
          style={{ width: `${(failed / total) * 100}%` }}
        />
      </div>

      {/* Review Checklist */}
      <div className="space-y-2">
        {REVIEW_ORDER.map((type) => {
          const config = reviewConfig[type];
          const review = reviewMap.get(type);
          const status = review?.status || 'pending';
          const statusCfg = statusConfig[status];

          return (
            <div
              key={type}
              className={`rounded-lg p-4 border border-mc-border ${statusCfg.bgColor}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{config.emoji}</span>
                  <div>
                    <p className="font-medium">{config.label}</p>
                    <p className="text-xs text-mc-text-secondary">{config.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={statusCfg.color}>{statusCfg.icon}</span>
                  <span className={`text-sm font-medium ${statusCfg.color}`}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </span>
                </div>
              </div>

              {/* Notes */}
              {review?.notes && (
                <p className="mt-2 text-sm text-mc-text-secondary pl-9">
                  {review.notes}
                </p>
              )}

              {/* Reviewer info */}
              {review?.reviewer_agent_name && (
                <p className="mt-1 text-xs text-mc-text-secondary pl-9">
                  {review.reviewer_agent_emoji} {review.reviewer_agent_name} • {review.reviewed_at ? new Date(review.reviewed_at).toLocaleString() : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* All Passed Indicator */}
      {allPassed && (
        <div className="flex items-center gap-2 text-green-400 bg-green-400/10 rounded-lg p-4 border border-green-400/20">
          <CheckCircle2 className="w-6 h-6" />
          <div>
            <p className="font-medium">All reviews passed!</p>
            <p className="text-sm text-green-300">Task will auto-move to Done</p>
          </div>
        </div>
      )}
    </div>
  );
}
