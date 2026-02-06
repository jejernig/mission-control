'use client';

import { useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import type { Agent, Workspace } from '@/lib/types';

interface WorkspaceRow extends Workspace {
  // ensure organization_id is present even if types lag
  organization_id?: string | null;
}

type SelectedRow = 'org' | string; // 'org' = org-wide row, or workspace_id

function AgentsPageContent() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedRow, setSelectedRow] = useState<SelectedRow>('org');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load workspaces + agents
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const [wsRes, agentsRes] = await Promise.all([
          fetch('/api/workspaces'),
          fetch('/api/agents'),
        ]);

        if (!wsRes.ok) throw new Error('Failed to load workspaces');
        if (!agentsRes.ok) throw new Error('Failed to load agents');

        const wsData = (await wsRes.json()) as WorkspaceRow[];
        const agentsData = (await agentsRes.json()) as Agent[];

        setWorkspaces(wsData);
        setAgents(agentsData);

        // Default selection: org row
        setSelectedRow('org');
      } catch (e) {
        console.error('Failed to load agents page:', e);
        setError('Failed to load agents or workspaces');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const orgId = workspaces.find((w) => w.id === 'default')?.organization_id ?? 'org-default';

  // Org-wide agents have workspace_id === null
  const orgAgents = agents.filter((a) => a.workspace_id === null);
  const workspaceAgents = agents.filter((a) => a.workspace_id !== null);

  const selectedWorkspace =
    selectedRow !== 'org' ? workspaces.find((w) => w.id === selectedRow) : undefined;

  const workspaceAgentsForSelected = selectedWorkspace
    ? workspaceAgents.filter((a) => a.workspace_id === selectedWorkspace.id)
    : [];

  async function promoteToOrg(agent: Agent) {
    try {
      setSavingId(agent.id);
      setError(null);
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: null }),
      });
      if (!res.ok) throw new Error('PATCH failed');
      const updated = (await res.json()) as Agent;
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (e) {
      console.error('Failed to promote agent to org:', e);
      setError('Failed to promote agent to org-wide');
    } finally {
      setSavingId(null);
    }
  }

  async function demoteToWorkspace(agent: Agent, workspaceId: string) {
    try {
      setSavingId(agent.id);
      setError(null);
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      if (!res.ok) throw new Error('PATCH failed');
      const updated = (await res.json()) as Agent;
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (e) {
      console.error('Failed to demote agent to workspace:', e);
      setError('Failed to assign agent to workspace');
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-mc-text-secondary">Loading agents...</div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-400 text-sm">{error}</div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: workspace selector */}
      <aside className="w-64 border-r border-mc-border bg-mc-bg-secondary p-3 flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-mc-text-secondary mb-1">
          Workspaces
        </h2>
        <button
          className={`w-full text-left px-3 py-1.5 rounded text-sm flex items-center justify-between ${
            selectedRow === 'org' ? 'bg-mc-accent text-mc-bg' : 'hover:bg-mc-bg-tertiary text-mc-text'
          }`}
          onClick={() => setSelectedRow('org')}
        >
          <span>Org-wide agents</span>
          <span className="text-xs text-mc-text-secondary">{orgAgents.length}</span>
        </button>
        <div className="mt-2 flex-1 overflow-y-auto space-y-1">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              className={`w-full text-left px-3 py-1.5 rounded text-sm flex items-center justify-between ${
                selectedRow === ws.id
                  ? 'bg-mc-accent text-mc-bg'
                  : 'hover:bg-mc-bg-tertiary text-mc-text'
              }`}
              onClick={() => setSelectedRow(ws.id)}
            >
              <span className="truncate flex items-center gap-2">
                <span>{ws.icon}</span>
                <span>{ws.name}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* Right: agents table */}
      <main className="flex-1 p-4 space-y-6 overflow-y-auto">
        {/* Org-wide view */}
        {selectedRow === 'org' && (
          <section>
            <h2 className="text-sm font-semibold mb-3">Org-wide agents</h2>
            {orgAgents.length === 0 ? (
              <div className="text-sm text-mc-text-secondary">No org-wide agents yet.</div>
            ) : (
              <div className="space-y-1">
                {orgAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between px-3 py-2 bg-mc-bg rounded border border-mc-border"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl">{agent.avatar_emoji}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{agent.name}</span>
                          {!!agent.is_master && (
                            <span className="text-xs text-mc-accent-yellow">★</span>
                          )}
                        </div>
                        <div className="text-xs text-mc-text-secondary truncate">
                          {agent.role}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary">
                        Org-wide
                      </span>
                      {/* Demote dropdown: pick workspace */}
                      {workspaces.length > 0 && (
                        <select
                          className="text-xs bg-mc-bg-tertiary border border-mc-border rounded px-2 py-1 text-mc-text"
                          disabled={savingId === agent.id}
                          defaultValue=""
                          onChange={(e) => {
                            const wsId = e.target.value;
                            if (wsId) demoteToWorkspace(agent, wsId);
                          }}
                        >
                          <option value="" disabled>
                            Move to workspace…
                          </option>
                          {workspaces.map((ws) => (
                            <option key={ws.id} value={ws.id}>
                              {ws.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Workspace-specific view */}
        {selectedRow !== 'org' && selectedWorkspace && (
          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
                Org agents in {selectedWorkspace.name}
              </h2>
              {orgAgents.length === 0 ? (
                <div className="text-xs text-mc-text-secondary">No org-wide agents.</div>
              ) : (
                <div className="space-y-1">
                  {orgAgents.map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between px-3 py-2 bg-mc-bg rounded border border-mc-border"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-2xl">{agent.avatar_emoji}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{agent.name}</span>
                            {!!agent.is_master && (
                              <span className="text-xs text-mc-accent-yellow">★</span>
                            )}
                          </div>
                          <div className="text-xs text-mc-text-secondary truncate">
                            {agent.role}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary">
                        Org-wide
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
                Workspace agents for {selectedWorkspace.name}
              </h2>
              {workspaceAgentsForSelected.length === 0 ? (
                <div className="text-xs text-mc-text-secondary">No workspace agents yet.</div>
              ) : (
                <div className="space-y-1">
                  {workspaceAgentsForSelected.map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between px-3 py-2 bg-mc-bg rounded border border-mc-border"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-2xl">{agent.avatar_emoji}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{agent.name}</span>
                            {!!agent.is_master && (
                              <span className="text-xs text-mc-accent-yellow">★</span>
                            )}
                          </div>
                          <div className="text-xs text-mc-text-secondary truncate">
                            {agent.role}
                          </div>
                        </div>
                      </div>
                      <button
                        disabled={savingId === agent.id}
                        onClick={() => promoteToOrg(agent)}
                        className="text-xs px-2 py-0.5 rounded bg-mc-accent text-mc-bg hover:bg-mc-accent-hover disabled:opacity-50"
                      >
                        Promote to Org-wide
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default function AgentsPage() {
  return (
    <ErrorBoundary>
      <AgentsPageContent />
    </ErrorBoundary>
  );
}
