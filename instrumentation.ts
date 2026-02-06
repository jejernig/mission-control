/**
 * Next.js instrumentation file
 * This file runs once when the server starts
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Load plugins on server startup
    const { loadAllPlugins } = await import('./src/lib/plugins/loader');
    await loadAllPlugins();
  }
}
