/**
 * LoadingSpinner - Reusable loading indicator component
 */
export function LoadingSpinner({ 
  size = 'md',
  message
}: {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}) {
  const sizeClasses = {
    sm: 'text-2xl',
    md: 'text-4xl',
    lg: 'text-6xl'
  };

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className={`${sizeClasses[size]} mb-4 animate-pulse`}>
        🦞
      </div>
      {message && (
        <p className="text-mc-text-secondary text-sm">{message}</p>
      )}
    </div>
  );
}
