/**
 * Plugin initialization
 * Import this module to trigger plugin loading on server start
 */

import { loadAllPlugins } from './loader';

let initialized = false;

// Auto-initialize plugins when this module is imported
if (typeof window === 'undefined' && !initialized) {
  initialized = true;
  
  // Use setTimeout to avoid blocking server startup
  setTimeout(async () => {
    console.log('[Plugins] Initializing plugin system...');
    await loadAllPlugins();
    console.log('[Plugins] Plugin system initialized');
  }, 0);
}

export { initialized };
