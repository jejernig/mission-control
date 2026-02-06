/**
 * Next.js Instrumentation Hook
 * Runs on server startup
 * 
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Initializing Mission Control services...');
    
    // Start OpenClaw session monitor
    const { startSessionMonitor } = await import('./lib/openclaw/session-monitor');
    startSessionMonitor();
    console.log('[Instrumentation] OpenClaw session monitor started');
  }
}
