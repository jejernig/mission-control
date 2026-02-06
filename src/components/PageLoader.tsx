/**
 * PageLoader - Full-page loading state
 */
export function PageLoader({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="min-h-screen bg-mc-bg flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-pulse">🦞</div>
        <p className="text-mc-text-secondary">{message}</p>
      </div>
    </div>
  );
}
