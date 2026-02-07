# React Suspense Migration Guide

## Overview

Mission Control now uses React Suspense for declarative loading states, powered by TanStack Query v5.

## Architecture

### Global Setup

- **QueryProvider** (`src/providers/QueryProvider.tsx`) - Global QueryClient with Suspense enabled
- **ErrorBoundary** (`src/components/ErrorBoundary.tsx`) - Catches query errors and renders fallback UI
- **LoadingSkeletons** (`src/components/LoadingSkeletons.tsx`) - Reusable skeleton components

### Query Hooks

Query hooks are organized in `src/hooks/queries/`:

- `useWorkspaces` - Fetch workspaces (with optional stats)
- `useAgents` - Fetch agents
- `useUpdateAgent` - Mutation for updating agent properties

## Migration Pattern

### Before (Manual Loading States)

```tsx
'use client';
import { useState, useEffect } from 'react';

function MyComponent() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/data');
        if (res.ok) setData(await res.json());
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!data.length) return <div>No data</div>;

  return <div>{/* render data */}</div>;
}
```

### After (Suspense + React Query)

```tsx
'use client';
import { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ListSkeleton } from '@/components/LoadingSkeletons';

function MyComponentContent() {
  // Suspense mode enabled - no loading state needed!
  const { data = [] } = useQuery({
    queryKey: ['myData'],
    queryFn: async () => {
      const res = await fetch('/api/data');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  if (!data.length) return <div>No data</div>;

  return <div>{/* render data */}</div>;
}

export default function MyComponent() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<ListSkeleton rows={5} />}>
        <MyComponentContent />
      </Suspense>
    </ErrorBoundary>
  );
}
```

## Key Benefits

✅ **15+ lines removed** per component (no more useState/useEffect/loading/error state)  
✅ **Better UX** - Skeleton screens instead of generic "Loading..." text  
✅ **Automatic error handling** - ErrorBoundary catches all query errors  
✅ **Type-safe queries** - Full TypeScript support  
✅ **Built-in caching** - 5-minute stale time, automatic refetch on mutations  
✅ **Optimistic updates** - Mutations invalidate queries automatically  

## Available Skeleton Components

```tsx
import {
  ListSkeleton,           // Generic list loading state
  CardSkeleton,           // Card/panel loading state
  PageHeaderSkeleton,     // Page header loading state
  WorkspaceGridSkeleton,  // Grid of workspace cards
  AgentsListSkeleton,     // Agents list with avatars
} from '@/components/LoadingSkeletons';
```

## Query Key Conventions

```ts
// Good ✅
['workspaces']                      // List all workspaces
['workspaces', { stats: true }]     // Workspaces with stats
['agents']                          // List all agents
['agents', workspaceId]             // Agents for specific workspace

// Bad ❌
['getWorkspaces']                   // Don't use "get" prefix
['workspace_list']                  // Use camelCase
```

## Migrated Components

- ✅ `AsyncWorkspaceList` - Uses `useWorkspaces` with Suspense
- ✅ `WorkspaceDashboard` - Wraps list in Suspense boundary
- ✅ `AgentsPage` - Uses `useAgents` and `useWorkspaces` with Suspense

## Next Steps

Future migrations:

1. **WorkspacePage** - Complex SSE/polling logic (requires refactoring)
2. **Task components** - Create `useTasks` query hook
3. **Event components** - Create `useEvents` query hook

## Troubleshooting

### "Suspense boundary not working"

Make sure:
1. QueryProvider wraps your component tree (should be in root layout)
2. `suspense: true` is set in QueryClient config
3. You're using `useQuery`, not manual fetch

### "Query never resolves"

Check:
1. API endpoint returns valid JSON
2. No CORS errors in console
3. Query function throws on error (don't return error objects)

### "Too many re-renders"

Make sure:
1. Query keys are stable (don't use objects unless memoized)
2. You're not calling `invalidateQueries` in render
3. Mutations are awaited before UI updates

## References

- [React Suspense Docs](https://react.dev/reference/react/Suspense)
- [TanStack Query Suspense](https://tanstack.com/query/latest/docs/react/guides/suspense)
- [Next.js Loading UI](https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming)
