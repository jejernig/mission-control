/**
 * Plugin hook execution system
 * Safely executes plugin hooks without crashing the server
 */

import type { Task, TaskActivity, TaskDeliverable } from '../types';
import { getLoadedPlugins } from './loader';

/**
 * Safely execute a hook function with error isolation
 */
async function safeExecuteHook(
  pluginId: string,
  hookName: string,
  hookFn: (...args: any[]) => any,
  ...args: any[]
): Promise<void> {
  try {
    const result = hookFn(...args);
    // Handle async hooks
    if (result instanceof Promise) {
      await result;
    }
  } catch (error) {
    console.error(`[Plugin:${pluginId}] Error in ${hookName}:`, error);
    // Error is logged but doesn't crash the server
  }
}

/**
 * Execute onTaskCreated hooks for all plugins
 */
export async function executeOnTaskCreated(task: Task): Promise<void> {
  const plugins = getLoadedPlugins();
  
  for (const { plugin } of plugins) {
    if (plugin.hooks.onTaskCreated) {
      await safeExecuteHook(
        plugin.manifest.id,
        'onTaskCreated',
        plugin.hooks.onTaskCreated,
        task
      );
    }
  }
}

/**
 * Execute onTaskUpdated hooks for all plugins
 */
export async function executeOnTaskUpdated(task: Task): Promise<void> {
  const plugins = getLoadedPlugins();
  
  for (const { plugin } of plugins) {
    if (plugin.hooks.onTaskUpdated) {
      await safeExecuteHook(
        plugin.manifest.id,
        'onTaskUpdated',
        plugin.hooks.onTaskUpdated,
        task
      );
    }
  }
}

/**
 * Execute onActivityLogged hooks for all plugins
 */
export async function executeOnActivityLogged(activity: TaskActivity): Promise<void> {
  const plugins = getLoadedPlugins();
  
  for (const { plugin } of plugins) {
    if (plugin.hooks.onActivityLogged) {
      await safeExecuteHook(
        plugin.manifest.id,
        'onActivityLogged',
        plugin.hooks.onActivityLogged,
        activity
      );
    }
  }
}

/**
 * Execute onDeliverableAdded hooks for all plugins
 */
export async function executeOnDeliverableAdded(deliverable: TaskDeliverable): Promise<void> {
  const plugins = getLoadedPlugins();
  
  for (const { plugin } of plugins) {
    if (plugin.hooks.onDeliverableAdded) {
      await safeExecuteHook(
        plugin.manifest.id,
        'onDeliverableAdded',
        plugin.hooks.onDeliverableAdded,
        deliverable
      );
    }
  }
}
