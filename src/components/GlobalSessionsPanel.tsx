/**
 * GlobalSessionsPanel Component
 * Shows all live OpenClaw sub-agent sessions across the system
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, RefreshCw, Zap, Bot, Circle, XCircle } from 'lucide-react';

interface LiveSession {
  key: string;
  sessionId: string;
  label?: string;
  displayName?: string;
  channel?: string;
  updatedAt: number;
  totalTokens: number;
  model?: string;
  abortedLastRun?: boolean;
}

interface GlobalSessionsPanelProps {
  onClose: () => void;
}

export function GlobalSessionsPanel({ onClose }: GlobalSessionsPanelProps) {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/openclaw/sessions');
      if (res.ok) {
        const data = await res.json();
        const allSessions = data.sessions?.sessions || data.sessions || [];
        // Filter to only subagent sessions and sort by most recent
        const subagentSessions = allSessions
          .filter((s: LiveSession) => s.key?.includes(':subagent:'))
          .sort((a: LiveSession, b: LiveSession) => b.updatedAt - a.updatedAt);
        setSessions(subagentSessions);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    // Auto-refresh every 10 seconds
    const interval = setInterval(loadSessions, 10000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadSessions();
  };

  const formatDuration = (updatedAt: number) => {
    const now = Date.now();
    const duration = now - updatedAt;
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'just now';
    }
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  const parseSessionKey = (key: string) => {
    // e.g., "agent:code-reviewer:subagent:f48019c1-..."
    const parts = key.split(':');
    return {
      agentName: parts[1] || 'Unknown',
      sessionId: parts[3] || key,
    };
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-lg w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-mc-border">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-yellow-500" />
            <h2 className="text-lg font-semibold">Live Sub-Agent Sessions</h2>
            <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded">
              {sessions.length} active
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 hover:bg-mc-bg-tertiary rounded disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-mc-bg-tertiary rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-mc-text-secondary">Loading sessions...</div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-mc-text-secondary">
              <Bot className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg">No active sub-agent sessions</p>
              <p className="text-sm mt-1">Sessions will appear here when agents spawn sub-agents</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const { agentName } = parseSessionKey(session.key);
                const isRecent = Date.now() - session.updatedAt < 60000; // Active in last minute
                
                return (
                  <div
                    key={session.sessionId || session.key}
                    className={`p-4 rounded-lg border ${
                      isRecent 
                        ? 'bg-green-500/5 border-green-500/30' 
                        : session.abortedLastRun 
                          ? 'bg-red-500/5 border-red-500/30'
                          : 'bg-mc-bg border-mc-border'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">🤖</div>
                        <div>
                          <div className="flex items-center gap-2">
                            {isRecent ? (
                              <Circle className="w-3 h-3 text-green-500 fill-current animate-pulse" />
                            ) : session.abortedLastRun ? (
                              <XCircle className="w-3 h-3 text-red-500" />
                            ) : (
                              <Circle className="w-3 h-3 text-yellow-500" />
                            )}
                            <span className="font-medium">{agentName}</span>
                            {session.label && (
                              <span className="text-xs bg-mc-accent/20 text-mc-accent px-2 py-0.5 rounded">
                                {session.label}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-mc-text-secondary font-mono mt-1 truncate max-w-md">
                            {session.key}
                          </div>
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="text-mc-text-secondary">
                          {formatDuration(session.updatedAt)}
                        </div>
                        {session.abortedLastRun && (
                          <div className="text-red-400 text-xs">aborted</div>
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 mt-3 text-xs text-mc-text-secondary">
                      <span className="flex items-center gap-1">
                        📊 {formatTokens(session.totalTokens)} tokens
                      </span>
                      {session.model && (
                        <span className="flex items-center gap-1">
                          🧠 {session.model.replace('claude-', '').replace('anthropic/', '')}
                        </span>
                      )}
                      {session.channel && (
                        <span className="flex items-center gap-1">
                          📡 {session.channel}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-mc-border text-xs text-mc-text-secondary">
          Sessions refresh automatically every 10 seconds. Data sourced from OpenClaw Gateway.
        </div>
      </div>
    </div>
  );
}
