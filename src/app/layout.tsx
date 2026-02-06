import type { Metadata } from 'next';
import './globals.css';
import { ErrorBoundaryProvider } from '@/components/ErrorBoundaryProvider';

export const metadata: Metadata = {
  title: 'Mission Control',
  description: 'AI Agent Orchestration Dashboard',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-mc-bg text-mc-text min-h-screen">
        <ErrorBoundaryProvider>{children}</ErrorBoundaryProvider>
      </body>
    </html>
  );
}
