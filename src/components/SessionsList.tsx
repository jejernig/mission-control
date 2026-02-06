/**
 * SessionsList Component
 * Displays OpenClaw sub-agent sessions for a task
 * Shows both registered sessions and live sessions from OpenClaw Gateway
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bot, CheckCircle, Circle, XCircle, Trash2, Check, Zap, RefreshCw } from 'lucide-react';

interface SessionWithAgent {
  id: string;
  agent_id: string | null;
  openclaw_session_id: string;
  channel: string | null;
  status: string;
  session_type: string;
  task_id: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  agent_name?: string;
  agent_avatar_emoji?: string;
  // Extra fields for live sessions
  _live?: boolean;
  _label?: string;
  _totalTokens?: number;
  _model?: string;
}

interface SessionsListProps {
  taskId?: string; // Optional - if not provided, show all sessions
}

export function SessionsList({ taskId }: SessionsListProps) {
  const [sessions, setSessions] = useState<SessionWithAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      // If taskId provided, fetch for that task; otherwise fetch all live sessions
      const url = taskId 
        ? `/api/tasks/${taskId}/subagent`
        : '/api/openclaw/sessions';
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        // Handle both array and { sessions: [] } formats
        const sessionsList = Array.isArray(data) ? data : (data.sessions || []);
        
        // If fetching from /api/openclaw/sessions, filter to subagents and transform
        if (!taskId && Array.isArray(sessionsList)) {
          const subagentSessions = sessionsList
            .filter((s: { key?: string }) => s.key?.includes(':subagent:'))
            .map((s: { key: string; sessionId: string; label?: string; channel?: string; updatedAt: number; totalTokens?: number; model?: string; abortedLastRun?: boolean }) => {
              const keyParts = s.key?.split(':') || [];
              const agentName = keyParts[1] || 'Unknown';
              return {
                id: s.sessionId || s.key,
                agent_id: null,
                openclaw_session_id: s.key,
                channel: s.channel || null,
                status: s.abortedLastRun ? 'failed' : 'active',
                session_type: 'subagent',
                task_id: null,
                ended_at: null,
                created_at: new Date(s.updatedAt).toISOString(),
                updated_at: new Date(s.updatedAt).toISOString(),
                agent_name: agentName,
                agent_avatar_emoji: '🤖',
                _live: true,
                _label: s.label,
                _totalTokens: s.totalTokens,
                _model: s.model,
              };
            });
          setSessions(subagentSessions);
        } else {
          setSessions(sessionsList);
        }
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadSessions();
    // Auto-refresh every 15 seconds for live data
    const interval = setInterval(loadSessions, 15000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadSessions();
  };

  const getStatusIcon = (status: string, isLive?: boolean) => {
    if (isLive) {
      return <Zap className="w-4 h-4 text-yellow-500 animate-pulse" />;
    }
    switch (status) {
      case 'active':
        return <Circle className="w-4 h-4 text-green-500 fill-current animate-pulse" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-mc-accent" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Circle className="w-4 h-4 text-mc-text-secondary" />;
    }
  };

  const formatDuration = (start: string, end?: string | null) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const duration = endTime - startTime;

    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatTokens = (tokens?: number) => {
    if (!tokens) return null;
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M tokens`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K tokens`;
    }
    return `${tokens} tokens`;
  };

  const handleMarkComplete = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/openclaw/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          ended_at: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        loadSessions();
      }
    } catch (error) {
      console.error('Failed to mark session complete:', error);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!confirm('Delete this sub-agent session?')) return;
    try {
      const res = await fetch(`/api/openclaw/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        loadSessions();
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-mc-text-secondary">Loading sessions...</div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-mc-text-secondary">
        <div className="text-4xl mb-2">🤖</div>
        <p>No sub-agent sessions</p>
        <button
          onClick={handleRefresh}
          className="mt-3 flex items-center gap-2 px-3 py-1 text-sm bg-mc-bg-tertiary hover:bg-mc-border rounded"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
    );
  }

  // Separate live and registered sessions
  const liveSessions = sessions.filter(s => s._live);
  const registeredSessions = sessions.filter(s => !s._live);

  return (
    <div className="space-y-4">
      {/* Refresh button */}
      <div className="flex justify-end">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1 text-sm bg-mc-bg-tertiary hover:bg-mc-border rounded disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Live Sessions Section */}
      {liveSessions.length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-wider text-mc-text-secondary mb-2 flex items-center gap-2">
            <Zap className="w-3 h-3 text-yellow-500" />
            Live Sessions ({liveSessions.length})
          </h4>
          <div className="space-y-2">
            {liveSessions.map((session) => (
              <SessionCard 
                key={session.id} 
                session={session}
                getStatusIcon={getStatusIcon}
                formatDuration={formatDuration}
                formatTimestamp={formatTimestamp}
                formatTokens={formatTokens}
                onMarkComplete={handleMarkComplete}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* Registered Sessions Section */}
      {registeredSessions.length > 0 && (
        <div>
          {liveSessions.length > 0 && (
            <h4 className="text-xs uppercase tracking-wider text-mc-text-secondary mb-2">
              Registered Sessions ({registeredSessions.length})
            </h4>
          )}
          <div className="space-y-2">
            {registeredSessions.map((session) => (
              <SessionCard 
                key={session.id} 
                session={session}
                getStatusIcon={getStatusIcon}
                formatDuration={formatDuration}
                formatTimestamp={formatTimestamp}
                formatTokens={formatTokens}
                onMarkComplete={handleMarkComplete}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Extracted SessionCard component for cleaner code
function SessionCard({
  session,
  getStatusIcon,
  formatDuration,
  formatTimestamp,
  formatTokens,
  onMarkComplete,
  onDelete,
}: {
  session: SessionWithAgent;
  getStatusIcon: (status: string, isLive?: boolean) => React.ReactNode;
  formatDuration: (start: string, end?: string | null) => string;
  formatTimestamp: (timestamp: string) => string;
  formatTokens: (tokens?: number) => string | null;
  onMarkComplete: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
}) {
  return (
    <div
      className={`flex gap-3 p-3 bg-mc-bg rounded-lg border ${
        session._live ? 'border-yellow-500/30' : 'border-mc-border'
      }`}
    >
      {/* Agent Avatar */}
      <div className="flex-shrink-0">
        {session.agent_avatar_emoji ? (
          <span className="text-2xl">{session.agent_avatar_emoji}</span>
        ) : (
          <Bot className="w-8 h-8 text-mc-accent" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Agent name and status */}
        <div className="flex items-center gap-2 mb-1">
          {getStatusIcon(session.status, session._live)}
          <span className="font-medium text-mc-text">
            {session.agent_name || 'Sub-Agent'}
          </span>
          {session._live && (
            <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">
              LIVE
            </span>
          )}
          <span className="text-xs text-mc-text-secondary capitalize">
            {session.status}
          </span>
        </div>

        {/* Label (for live sessions) */}
        {session._label && (
          <div className="text-sm text-mc-accent mb-1">
            📋 {session._label}
          </div>
        )}

        {/* Session ID */}
        <div className="text-xs text-mc-text-secondary font-mono mb-2 truncate">
          {session.openclaw_session_id}
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-mc-text-secondary">
          <span>
            ⏱️ {formatDuration(session.created_at, session.ended_at)}
          </span>
          {session._totalTokens && (
            <span>
              📊 {formatTokens(session._totalTokens)}
            </span>
          )}
          {session._model && (
            <span>
              🧠 {session._model.replace('claude-', '').replace('anthropic/', '')}
            </span>
          )}
          {session.channel && (
            <span>
              📡 {session.channel}
            </span>
          )}
        </div>

        {/* Timestamp */}
        <div className="mt-1 text-xs text-mc-text-secondary">
          Last active: {formatTimestamp(session.updated_at)}
        </div>
      </div>

      {/* Action Buttons - only for registered sessions */}
      {!session._live && (
        <div className="flex flex-col gap-1">
          {session.status === 'active' && (
            <button
              onClick={() => onMarkComplete(session.openclaw_session_id)}
              className="p-1.5 hover:bg-mc-bg-tertiary rounded text-green-500"
              title="Mark as complete"
            >
              <Check className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onDelete(session.openclaw_session_id)}
            className="p-1.5 hover:bg-mc-bg-tertiary rounded text-red-500"
            title="Delete session"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
