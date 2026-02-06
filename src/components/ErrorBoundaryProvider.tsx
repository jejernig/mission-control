'use client';

import { ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface ErrorBoundaryProviderProps {
  children: ReactNode;
}

/**
 * Client-side ErrorBoundary provider for use in server components
 */
export function ErrorBoundaryProvider({ children }: ErrorBoundaryProviderProps) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
