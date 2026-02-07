/**
 * LoadingSkeletons - Reusable skeleton components for Suspense fallbacks
 */

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 items-center">
          <div className="h-10 bg-mc-bg-tertiary rounded w-full"></div>
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="p-6 border border-mc-border bg-mc-bg-secondary rounded-xl animate-pulse">
      <div className="h-6 bg-mc-bg-tertiary rounded w-1/3 mb-4"></div>
      <div className="h-4 bg-mc-bg-tertiary rounded w-full mb-2"></div>
      <div className="h-4 bg-mc-bg-tertiary rounded w-2/3"></div>
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-mc-bg-tertiary rounded w-1/4 mb-2"></div>
      <div className="h-4 bg-mc-bg-tertiary rounded w-1/2"></div>
    </div>
  );
}

export function WorkspaceGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function AgentsListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between px-3 py-2 bg-mc-bg rounded border border-mc-border animate-pulse"
        >
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 bg-mc-bg-tertiary rounded"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-mc-bg-tertiary rounded w-1/3"></div>
              <div className="h-3 bg-mc-bg-tertiary rounded w-1/4"></div>
            </div>
          </div>
          <div className="h-6 bg-mc-bg-tertiary rounded w-20"></div>
        </div>
      ))}
    </div>
  );
}
