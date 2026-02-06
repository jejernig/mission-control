'use client';

import { useState, useEffect } from 'react';
import { WorkspaceCardSkeleton } from './WorkspaceCardSkeleton';
import type { WorkspaceStats } from '@/lib/types';
import Link from 'next/link';
import { ArrowRight, CheckSquare, Users, Trash2, AlertTriangle } from 'lucide-react';

interface WorkspaceWithChildren extends WorkspaceStats {
  parent_id?: string | null;
  children?: WorkspaceWithChildren[];
}

function buildWorkspaceTree(workspaces: WorkspaceWithChildren[]): WorkspaceWithChildren[] {
  const map = new Map<string, WorkspaceWithChildren>();
  const roots: WorkspaceWithChildren[] = [];
  
  workspaces.forEach(w => map.set(w.id, { ...w, children: [] }));
  
  workspaces.forEach(w => {
    const node = map.get(w.id)!;
    if (w.parent_id && map.has(w.parent_id)) {
      map.get(w.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });
  
  return roots;
}

function WorkspaceCard({ 
  workspace, 
  onDelete 
}: { 
  workspace: WorkspaceStats; 
  onDelete: (id: string) => void;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, { method: 'DELETE' });
      if (res.ok) {
        onDelete(workspace.id);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete workspace');
      }
    } catch {
      alert('Failed to delete workspace');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };
  
  return (
    <>
    <Link href={`/workspace/${workspace.slug}`}>
      <div className="bg-mc-bg-secondary border border-mc-border rounded-xl p-6 hover:border-mc-accent/50 transition-all hover:shadow-lg cursor-pointer group relative">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{workspace.icon}</span>
            <div>
              <h3 className="font-semibold text-lg group-hover:text-mc-accent transition-colors">
                {workspace.name}
              </h3>
              <p className="text-sm text-mc-text-secondary">/{workspace.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {workspace.id !== 'default' && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
                }}
                className="p-1.5 rounded hover:bg-mc-accent-red/20 text-mc-text-secondary hover:text-mc-accent-red transition-colors opacity-0 group-hover:opacity-100"
                title="Delete workspace"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <ArrowRight className="w-5 h-5 text-mc-text-secondary group-hover:text-mc-accent transition-colors" />
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-mc-text-secondary mt-4">
          <div className="flex items-center gap-1">
            <CheckSquare className="w-4 h-4" />
            <span>{workspace.taskCounts.total - workspace.taskCounts.done} active</span>
            {workspace.taskCounts.done > 0 && (
              <span className="text-mc-text-secondary/50">({workspace.taskCounts.done} done)</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            <span>{workspace.agentCount} agents</span>
          </div>
        </div>
      </div>
    </Link>

    {showDeleteConfirm && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowDeleteConfirm(false)}>
        <div className="bg-mc-bg-secondary border border-mc-border rounded-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-mc-accent-red/20 rounded-full">
              <AlertTriangle className="w-6 h-6 text-mc-accent-red" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Delete Workspace</h3>
              <p className="text-sm text-mc-text-secondary">This action cannot be undone</p>
            </div>
          </div>
          
          <p className="text-mc-text-secondary mb-6">
            Are you sure you want to delete <strong>{workspace.name}</strong>? 
            {workspace.taskCounts.total > 0 && (
              <span className="block mt-2 text-mc-accent-red">
                ⚠️ This workspace has {workspace.taskCounts.total} task(s). Delete them first.
              </span>
            )}
          </p>
          
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-4 py-2 text-mc-text-secondary hover:text-mc-text"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting || workspace.taskCounts.total > 0 || workspace.agentCount > 0}
              className="px-4 py-2 bg-mc-accent-red text-white rounded-lg font-medium hover:bg-mc-accent-red/90 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete Workspace'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export function AsyncWorkspaceList({ onDelete }: { onDelete: (id: string) => void }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceWithChildren[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/workspaces?stats=true');
        if (res.ok) {
          const data = await res.json();
          setWorkspaces(data);
        }
      } catch (error) {
        console.error('Failed to load workspaces:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <WorkspaceCardSkeleton />
        <WorkspaceCardSkeleton />
        <WorkspaceCardSkeleton />
      </div>
    );
  }

  const workspaceTree = buildWorkspaceTree(workspaces);

  if (workspaces.length === 0) {
    return (
      <div className="text-center py-8 text-mc-text-secondary">
        No workspaces found
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {workspaceTree.map((workspace) => (
        <WorkspaceCard 
          key={workspace.id} 
          workspace={workspace}
          onDelete={() => {
            onDelete(workspace.id);
            setWorkspaces(workspaces.filter(w => w.id !== workspace.id));
          }}
        />
      ))}
    </div>
  );
}
