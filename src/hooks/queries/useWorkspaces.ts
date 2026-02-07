import { useQuery } from '@tanstack/react-query';
import type { WorkspaceStats } from '@/lib/types';

export interface WorkspaceWithChildren extends WorkspaceStats {
  parent_id?: string | null;
  children?: WorkspaceWithChildren[];
}

async function fetchWorkspaces(withStats: boolean = false): Promise<WorkspaceWithChildren[]> {
  const url = withStats ? '/api/workspaces?stats=true' : '/api/workspaces';
  const res = await fetch(url);
  
  if (!res.ok) {
    throw new Error('Failed to fetch workspaces');
  }
  
  return res.json();
}

export function useWorkspaces(withStats: boolean = false) {
  return useQuery({
    queryKey: ['workspaces', { stats: withStats }],
    queryFn: () => fetchWorkspaces(withStats),
  });
}
