/**
 * Shared client-side utility functions
 * Eliminates duplicate formatting and display logic across components
 */

/**
 * Format timestamp as relative time (e.g., "5 mins ago", "2 hours ago")
 * Handles both string timestamps and Unix timestamps (milliseconds)
 */
export function formatTimestamp(timestamp: string | number): string {
  const date = typeof timestamp === 'number' 
    ? new Date(timestamp) 
    : new Date(timestamp);
  
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // Less than 1 minute
  if (diff < 60000) {
    return 'just now';
  }
  
  // Less than 1 hour
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins} min${mins > 1 ? 's' : ''} ago`;
  }
  
  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  
  // More than 24 hours - show date
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format duration from Unix timestamp to relative time
 * (e.g., "2h 15m ago", "5m ago", "just now")
 */
export function formatDuration(updatedAt: number): string {
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
}

/**
 * Format token count with K/M abbreviations
 * (e.g., 1500 → "1.5K", 2500000 → "2.5M")
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Format file size to human-readable format
 * (e.g., 1024 → "1.0 KB", 1048576 → "1.0 MB")
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format number with commas (e.g., 1234567 → "1,234,567")
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Truncate text to specified length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Get status color class for task status
 */
export function getStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    'backlog': 'text-gray-500 bg-gray-500/10',
    'assigned': 'text-blue-500 bg-blue-500/10',
    'in_progress': 'text-yellow-500 bg-yellow-500/10',
    'review': 'text-purple-500 bg-purple-500/10',
    'testing': 'text-cyan-500 bg-cyan-500/10',
    'blocked': 'text-red-500 bg-red-500/10',
    'done': 'text-green-500 bg-green-500/10',
    'archived': 'text-gray-400 bg-gray-400/10',
  };
  return statusColors[status] || 'text-gray-500 bg-gray-500/10';
}

/**
 * Get priority color class
 */
export function getPriorityColor(priority: string): string {
  const priorityColors: Record<string, string> = {
    'urgent': 'text-red-500',
    'high': 'text-orange-500',
    'medium': 'text-yellow-500',
    'low': 'text-green-500',
  };
  return priorityColors[priority] || 'text-gray-500';
}

/**
 * Capitalize first letter of string
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert snake_case to Title Case
 */
export function snakeToTitle(str: string): string {
  return str
    .split('_')
    .map(word => capitalize(word))
    .join(' ');
}

/**
 * Parse OpenClaw session key to extract agent name and session ID
 * @example parseSessionKey("agent:code-reviewer:subagent:f48019c1-...") 
 *   → { agentName: "code-reviewer", sessionId: "f48019c1-..." }
 */
export function parseSessionKey(key: string): { agentName: string; sessionId: string } {
  const parts = key.split(':');
  return {
    agentName: parts[1] || 'Unknown',
    sessionId: parts[3] || key,
  };
}

/**
 * Debounce function execution
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Download text content as a file
 */
export function downloadAsFile(content: string, filename: string, mimeType: string = 'text/plain'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
