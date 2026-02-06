/**
 * WorkspaceCardSkeleton - Loading skeleton for workspace cards
 */
export function WorkspaceCardSkeleton() {
  return (
    <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-6 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-mc-bg-tertiary rounded-lg" />
        <div className="flex-1 space-y-3">
          <div className="h-5 bg-mc-bg-tertiary rounded w-1/3" />
          <div className="h-4 bg-mc-bg-tertiary rounded w-2/3" />
          <div className="flex gap-4 mt-4">
            <div className="h-3 bg-mc-bg-tertiary rounded w-16" />
            <div className="h-3 bg-mc-bg-tertiary rounded w-16" />
            <div className="h-3 bg-mc-bg-tertiary rounded w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}
