/**
 * Mission Control Plugin System
 * 
 * Provides extensibility through a plugin architecture.
 * Plugins can hook into events like task creation, updates, activities, and deliverables.
 * 
 * @example
 * // Initialize plugins on server start
 * import { loadAllPlugins } from '@/lib/plugins';
 * await loadAllPlugins();
 * 
 * @example
 * // Execute hooks when events occur
 * import { executeOnTaskCreated } from '@/lib/plugins';
 * await executeOnTaskCreated(task);
 */

export { loadAllPlugins, reloadPlugins, getLoadedPlugins, getPlugin } from './loader';
export { 
  executeOnTaskCreated,
  executeOnTaskUpdated,
  executeOnActivityLogged,
  executeOnDeliverableAdded
} from './hooks';
export type { Plugin, PluginManifest, PluginHooks, PluginContext, LoadedPlugin } from './types';
