'use client';

import { useState, useEffect } from 'react';
import { GitBranch, ArrowUp, CheckCircle2, Circle, Clock, AlertCircle } from 'lucide-react';
import type { Task } from '@/lib/types';

interface SubtaskStats {
  total: number;
  done: number;
  in_progress: number;
  all_done: boolean;
}

interface SubtasksResponse {
  parent_id: string;
  subtasks: Task[];
  stats: SubtaskStats;
}

interface TaskArchitectureTabProps {
  task: Task;
}

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  done: { icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-green-400', label: 'Done' },
  in_progress: { icon: <Clock className="w-4 h-4" />, color: 'text-blue-400', label: 'In Progress' },
  testing: { icon: <Clock className="w-4 h-4" />, color: 'text-yellow-400', label: 'Testing' },
  review: { icon: <Clock className="w-4 h-4" />, color: 'text-purple-400', label: 'Review' },
  assigned: { icon: <Circle className="w-4 h-4" />, color: 'text-gray-400', label: 'Assigned' },
  inbox: { icon: <Circle className="w-4 h-4" />, color: 'text-gray-500', label: 'Inbox' },
};

export function TaskArchitectureTab({ task }: TaskArchitectureTabProps) {
  const [parentTask, setParentTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<SubtaskStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      
      try {
        // Fetch parent task if this is a subtask
        if (task.parent_task_id) {
          const parentRes = await fetch(`/api/tasks/${task.parent_task_id}`);
          if (parentRes.ok) {
            setParentTask(await parentRes.json());
          }
        }

        // Fetch subtasks if this might be a parent
        const subtasksRes = await fetch(`/api/tasks/${task.id}/subtasks`);
        if (subtasksRes.ok) {
          const data: SubtasksResponse = await subtasksRes.json();
          setSubtasks(data.subtasks);
          setStats(data.stats);
        }
      } catch (error) {
        console.error('Failed to fetch architecture data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [task.id, task.parent_task_id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-mc-text-secondary">
        Loading architecture...
      </div>
    );
  }

  const hasArchitecture = parentTask || subtasks.length > 0;

  if (!hasArchitecture) {
    return (
      <div className="text-center py-8 text-mc-text-secondary">
        <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No task hierarchy</p>
        <p className="text-sm mt-1">This task has no parent or sub-tasks</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Parent Task */}
      {parentTask && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-mc-text-secondary flex items-center gap-2">
            <ArrowUp className="w-4 h-4" />
            Parent Task
          </h3>
          <div className="bg-mc-bg-tertiary rounded-lg p-3 border border-mc-border">
            <div className="flex items-center gap-2">
              <span className={statusConfig[parentTask.status]?.color || 'text-gray-400'}>
                {statusConfig[parentTask.status]?.icon}
              </span>
              <span className="font-medium">{parentTask.title}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-mc-bg-secondary text-mc-text-secondary">
                {parentTask.status}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tasks */}
      {subtasks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-mc-text-secondary flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Sub-tasks
            </h3>
            {stats && (
              <span className="text-sm text-mc-text-secondary">
                {stats.done}/{stats.total} complete
              </span>
            )}
          </div>

          {/* Progress Bar */}
          {stats && stats.total > 0 && (
            <div className="w-full bg-mc-bg-tertiary rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${(stats.done / stats.total) * 100}%` }}
              />
            </div>
          )}

          {/* Subtask List */}
          <div className="space-y-2">
            {subtasks.map((subtask) => {
              const config = statusConfig[subtask.status] || statusConfig.inbox;
              return (
                <div
                  key={subtask.id}
                  className="bg-mc-bg-tertiary rounded-lg p-3 border border-mc-border flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className={config.color}>{config.icon}</span>
                    <div>
                      <p className="font-medium text-sm">{subtask.title}</p>
                      {subtask.assigned_agent_id && (
                        <p className="text-xs text-mc-text-secondary">
                          Assigned to worker
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${config.color} bg-mc-bg-secondary`}>
                    {config.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* All Done Indicator */}
          {stats?.all_done && (
            <div className="flex items-center gap-2 text-green-400 bg-green-400/10 rounded-lg p-3">
              <CheckCircle2 className="w-5 h-5" />
              <span>All sub-tasks complete! Parent will auto-progress.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
