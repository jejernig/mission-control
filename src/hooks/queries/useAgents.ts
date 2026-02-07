import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Agent } from '@/lib/types';

async function fetchAgents(): Promise<Agent[]> {
  const res = await fetch('/api/agents');
  
  if (!res.ok) {
    throw new Error('Failed to fetch agents');
  }
  
  return res.json();
}

async function updateAgent(agentId: string, updates: Partial<Agent>): Promise<Agent> {
  const res = await fetch(`/api/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  
  if (!res.ok) {
    throw new Error('Failed to update agent');
  }
  
  return res.json();
}

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: fetchAgents,
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ agentId, updates }: { agentId: string; updates: Partial<Agent> }) =>
      updateAgent(agentId, updates),
    onSuccess: () => {
      // Invalidate agents query to refetch
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}
