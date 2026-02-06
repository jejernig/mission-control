/**
 * Plugin system type definitions
 * Plugins can hook into Mission Control events and extend functionality
 */

import type { Task, TaskActivity, TaskDeliverable } from '../types';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  enabled?: boolean;
}

export interface PluginHooks {
  onTaskCreated?: (task: Task) => Promise<void> | void;
  onTaskUpdated?: (task: Task) => Promise<void> | void;
  onActivityLogged?: (activity: TaskActivity) => Promise<void> | void;
  onDeliverableAdded?: (deliverable: TaskDeliverable) => Promise<void> | void;
}

export interface Plugin {
  manifest: PluginManifest;
  hooks: PluginHooks;
}

export interface PluginContext {
  pluginId: string;
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

export interface LoadedPlugin {
  plugin: Plugin;
  filePath: string;
  loadedAt: Date;
}
