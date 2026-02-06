/**
 * Plugin loader - discovers and loads plugins from /plugins/ directory
 * Runs on Next.js server start
 */

import fs from 'fs';
import path from 'path';
import type { Plugin, LoadedPlugin, PluginManifest, PluginContext } from './types';

const PLUGINS_DIR = path.join(process.cwd(), 'plugins');

// In-memory registry of loaded plugins
const loadedPlugins: Map<string, LoadedPlugin> = new Map();

/**
 * Create a plugin context for logging and error handling
 */
function createPluginContext(pluginId: string): PluginContext {
  return {
    pluginId,
    log: (...args: any[]) => {
      console.log(`[Plugin:${pluginId}]`, ...args);
    },
    error: (...args: any[]) => {
      console.error(`[Plugin:${pluginId}]`, ...args);
    },
  };
}

/**
 * Load a single plugin from a directory
 */
async function loadPlugin(pluginDir: string): Promise<LoadedPlugin | null> {
  try {
    const manifestPath = path.join(pluginDir, 'plugin.json');
    const indexPath = path.join(pluginDir, 'index.js');

    // Check for required files
    if (!fs.existsSync(manifestPath)) {
      console.warn(`[Plugins] Skipping ${pluginDir}: missing plugin.json`);
      return null;
    }

    if (!fs.existsSync(indexPath)) {
      console.warn(`[Plugins] Skipping ${pluginDir}: missing index.js`);
      return null;
    }

    // Load manifest
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest: PluginManifest = JSON.parse(manifestContent);

    // Check if plugin is enabled (default to true)
    if (manifest.enabled === false) {
      console.log(`[Plugins] Skipping ${manifest.id}: disabled in manifest`);
      return null;
    }

    // Load plugin module
    // Plugins use CommonJS (module.exports), so we need require()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pluginModule = require(indexPath);
    
    // Call init function if it exists
    const context = createPluginContext(manifest.id);
    if (typeof pluginModule.init === 'function') {
      await pluginModule.init(context);
    }

    const plugin: Plugin = {
      manifest,
      hooks: {
        onTaskCreated: pluginModule.onTaskCreated,
        onTaskUpdated: pluginModule.onTaskUpdated,
        onActivityLogged: pluginModule.onActivityLogged,
        onDeliverableAdded: pluginModule.onDeliverableAdded,
      },
    };

    const loaded: LoadedPlugin = {
      plugin,
      filePath: pluginDir,
      loadedAt: new Date(),
    };

    console.log(`[Plugins] ✓ Loaded plugin: ${manifest.name} (${manifest.version})`);
    return loaded;
  } catch (error) {
    console.error(`[Plugins] Failed to load plugin from ${pluginDir}:`, error);
    return null;
  }
}

/**
 * Discover and load all plugins from the plugins directory
 */
export async function loadAllPlugins(): Promise<void> {
  try {
    // Create plugins directory if it doesn't exist
    if (!fs.existsSync(PLUGINS_DIR)) {
      console.log(`[Plugins] Creating plugins directory: ${PLUGINS_DIR}`);
      fs.mkdirSync(PLUGINS_DIR, { recursive: true });
      return;
    }

    // Discover plugin directories
    const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
    const pluginDirs = entries
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(PLUGINS_DIR, entry.name));

    if (pluginDirs.length === 0) {
      console.log(`[Plugins] No plugins found in ${PLUGINS_DIR}`);
      return;
    }

    console.log(`[Plugins] Discovering plugins in ${PLUGINS_DIR}...`);
    console.log(`[Plugins] Found ${pluginDirs.length} potential plugin(s)`);

    // Load each plugin
    let successCount = 0;
    for (const pluginDir of pluginDirs) {
      const loaded = await loadPlugin(pluginDir);
      if (loaded) {
        loadedPlugins.set(loaded.plugin.manifest.id, loaded);
        successCount++;
      }
    }

    console.log(`[Plugins] Successfully loaded ${successCount}/${pluginDirs.length} plugin(s)`);
  } catch (error) {
    console.error('[Plugins] Error loading plugins:', error);
  }
}

/**
 * Get all loaded plugins
 */
export function getLoadedPlugins(): LoadedPlugin[] {
  return Array.from(loadedPlugins.values());
}

/**
 * Get a specific plugin by ID
 */
export function getPlugin(pluginId: string): LoadedPlugin | undefined {
  return loadedPlugins.get(pluginId);
}

/**
 * Reload plugins (useful for development)
 */
export async function reloadPlugins(): Promise<void> {
  loadedPlugins.clear();
  // Clear require cache for plugin modules
  Object.keys(require.cache).forEach(key => {
    if (key.includes('/plugins/')) {
      delete require.cache[key];
    }
  });
  await loadAllPlugins();
}
