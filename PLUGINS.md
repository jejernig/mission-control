# Mission Control Plugin System

Mission Control includes a powerful plugin system that allows you to extend functionality and integrate with external services by hooking into events like task creation, updates, activity logging, and deliverable additions.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Plugin Structure](#plugin-structure)
- [Available Hooks](#available-hooks)
- [Plugin Context](#plugin-context)
- [Error Handling](#error-handling)
- [Examples](#examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

Plugins are stored in the `/plugins/` directory at the root of Mission Control. Each plugin is a subdirectory containing:

- `plugin.json` - Plugin metadata and configuration
- `index.js` - Plugin implementation with event hooks

Plugins are **automatically discovered and loaded** when the Next.js server starts.

## Quick Start

### 1. Create a Plugin Directory

```bash
cd mission-control
mkdir -p plugins/my-plugin
```

### 2. Create `plugin.json`

```json
{
  "id": "my-plugin",
  "name": "My Awesome Plugin",
  "version": "1.0.0",
  "description": "Does something cool when tasks are created",
  "author": "Your Name",
  "enabled": true
}
```

### 3. Create `index.js`

```javascript
/**
 * Initialize plugin (optional)
 */
async function init(context) {
  context.log('My plugin initialized!');
}

/**
 * Hook: Called when a task is created
 */
async function onTaskCreated(task) {
  console.log('New task created:', task.title);
  // Your custom logic here
}

module.exports = {
  init,
  onTaskCreated,
};
```

### 4. Restart Mission Control

```bash
npm run dev
```

Your plugin will be automatically loaded!

## Plugin Structure

### plugin.json

The manifest file describes your plugin:

```json
{
  "id": "unique-plugin-id",       // Required: Unique identifier
  "name": "Display Name",          // Required: Human-readable name
  "version": "1.0.0",              // Required: Semantic version
  "description": "What it does",   // Optional: Brief description
  "author": "Your Name",           // Optional: Plugin author
  "enabled": true                  // Optional: Enable/disable (default: true)
}
```

### index.js

The implementation file exports hook functions:

```javascript
// Optional: Called once when plugin loads
async function init(context) {
  // Setup logic
}

// Event hooks (all optional)
async function onTaskCreated(task) { }
async function onTaskUpdated(task) { }
async function onActivityLogged(activity) { }
async function onDeliverableAdded(deliverable) { }

// Export your hooks
module.exports = {
  init,
  onTaskCreated,
  onTaskUpdated,
  onActivityLogged,
  onDeliverableAdded,
};
```

## Available Hooks

### `init(context)`

**Called once** when the plugin is loaded at server startup.

**Parameters:**
- `context` - Plugin context with logging methods (see [Plugin Context](#plugin-context))

**Use for:**
- Initial setup
- Loading configuration
- Connecting to external services

```javascript
async function init(context) {
  context.log('Plugin starting up');
  // Load config, establish connections, etc.
}
```

### `onTaskCreated(task)`

Called when a new task is created.

**Parameters:**
- `task` - The created task object

**Task object includes:**
```typescript
{
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;  // 'planning' | 'inbox' | 'assigned' | etc.
  priority: TaskPriority;  // 'low' | 'normal' | 'high' | 'urgent'
  assigned_agent_id?: string;
  created_by_agent_id?: string;
  workspace_id: string;
  business_id: string;
  due_date?: string;
  parent_task_id?: string;
  created_at: string;
  updated_at: string;
}
```

**Example:**
```javascript
async function onTaskCreated(task) {
  if (task.priority === 'urgent') {
    // Send alert to Slack
    await notifySlack(`🚨 Urgent task created: ${task.title}`);
  }
}
```

### `onTaskUpdated(task)`

Called when a task is updated (status change, assignment, etc.).

**Parameters:**
- `task` - The updated task object (same structure as `onTaskCreated`)

**Example:**
```javascript
async function onTaskUpdated(task) {
  if (task.status === 'done') {
    // Log completion to analytics
    await trackCompletion(task.id, task.title);
  }
}
```

### `onActivityLogged(activity)`

Called when activity is logged on a task (agent spawned, status changed, etc.).

**Parameters:**
- `activity` - The activity object

**Activity object includes:**
```typescript
{
  id: string;
  task_id: string;
  agent_id?: string;
  activity_type: ActivityType;  // 'spawned' | 'updated' | 'completed' | etc.
  message: string;
  metadata?: string;  // JSON string
  created_at: string;
  agent?: Agent;  // Populated agent info
}
```

**Example:**
```javascript
async function onActivityLogged(activity) {
  if (activity.activity_type === 'completed') {
    // Update project dashboard
    await updateDashboard(activity.task_id);
  }
}
```

### `onDeliverableAdded(deliverable)`

Called when a deliverable is added to a task (file, URL, artifact, commit).

**Parameters:**
- `deliverable` - The deliverable object

**Deliverable object includes:**
```typescript
{
  id: string;
  task_id: string;
  deliverable_type: DeliverableType;  // 'file' | 'url' | 'artifact' | 'commit'
  title: string;
  path?: string;
  description?: string;
  created_at: string;
}
```

**Example:**
```javascript
async function onDeliverableAdded(deliverable) {
  if (deliverable.deliverable_type === 'commit') {
    // Trigger CI/CD pipeline
    await triggerBuild(deliverable.path);
  }
}
```

## Plugin Context

The `context` object is passed to the `init` function and provides logging utilities:

```typescript
interface PluginContext {
  pluginId: string;  // Your plugin's ID from plugin.json
  log: (...args: any[]) => void;    // Log info messages
  error: (...args: any[]) => void;  // Log error messages
}
```

**Example:**
```javascript
async function init(context) {
  context.log('Starting up');
  context.log('Plugin ID:', context.pluginId);
  
  try {
    // Some initialization logic
  } catch (err) {
    context.error('Failed to initialize:', err);
  }
}
```

## Error Handling

**Plugin errors are isolated** - if your plugin throws an error, it will be logged but **won't crash the Mission Control server**.

```javascript
async function onTaskCreated(task) {
  // Even if this throws, Mission Control continues running
  throw new Error('Something went wrong!');
}
```

Error output:
```
[Plugin:my-plugin] Error in onTaskCreated: Error: Something went wrong!
```

**Best practice:** Handle errors gracefully in your plugin code:

```javascript
async function onTaskCreated(task) {
  try {
    await sendToSlack(task);
  } catch (error) {
    console.error('[My Plugin] Failed to send to Slack:', error);
    // Continue gracefully
  }
}
```

## Examples

### Example 1: Slack Notifications

```javascript
const { WebClient } = require('@slack/web-api');

let slackClient;

async function init(context) {
  slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
  context.log('Slack plugin ready');
}

async function onTaskCreated(task) {
  if (task.priority === 'urgent') {
    await slackClient.chat.postMessage({
      channel: '#tasks',
      text: `🚨 Urgent task: ${task.title}`,
    });
  }
}

module.exports = { init, onTaskCreated };
```

### Example 2: GitHub Integration

```javascript
const { Octokit } = require('@octokit/rest');

let github;

async function init(context) {
  github = new Octokit({ auth: process.env.GITHUB_TOKEN });
  context.log('GitHub plugin initialized');
}

async function onDeliverableAdded(deliverable) {
  if (deliverable.deliverable_type === 'commit') {
    const [owner, repo] = process.env.GITHUB_REPO.split('/');
    const sha = deliverable.path;
    
    // Add comment to commit
    await github.repos.createCommitComment({
      owner,
      repo,
      commit_sha: sha,
      body: `✅ Deliverable added to Mission Control\nTask: ${deliverable.title}`,
    });
  }
}

module.exports = { init, onDeliverableAdded };
```

### Example 3: Time Tracking

```javascript
const taskTimestamps = new Map();

async function onTaskUpdated(task) {
  // Track when task moves to in_progress
  if (task.status === 'in_progress' && !taskTimestamps.has(task.id)) {
    taskTimestamps.set(task.id, Date.now());
  }
  
  // Calculate duration when task completes
  if (task.status === 'done' && taskTimestamps.has(task.id)) {
    const startTime = taskTimestamps.get(task.id);
    const duration = Date.now() - startTime;
    const hours = (duration / (1000 * 60 * 60)).toFixed(2);
    
    console.log(`Task ${task.title} took ${hours} hours`);
    taskTimestamps.delete(task.id);
  }
}

module.exports = { onTaskUpdated };
```

### Example 4: Analytics Dashboard

```javascript
const fs = require('fs');
const path = require('path');

const statsFile = path.join(__dirname, 'stats.json');
let stats = { tasksCreated: 0, tasksCompleted: 0 };

async function init(context) {
  // Load existing stats
  if (fs.existsSync(statsFile)) {
    stats = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
  }
  context.log('Stats:', stats);
}

async function onTaskCreated(task) {
  stats.tasksCreated++;
  saveStats();
}

async function onTaskUpdated(task) {
  if (task.status === 'done') {
    stats.tasksCompleted++;
    saveStats();
  }
}

function saveStats() {
  fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
}

module.exports = { init, onTaskCreated, onTaskUpdated };
```

## Best Practices

### 1. Keep Plugins Focused

Each plugin should do **one thing well**. Create separate plugins for different integrations.

### 2. Use Async/Await

Plugins support both sync and async hooks. Use async for external API calls:

```javascript
async function onTaskCreated(task) {
  await fetch('https://api.example.com/notify', {
    method: 'POST',
    body: JSON.stringify(task),
  });
}
```

### 3. Handle Errors Gracefully

Don't let plugin errors disrupt Mission Control:

```javascript
async function onTaskCreated(task) {
  try {
    await externalAPI.create(task);
  } catch (error) {
    console.error('[Plugin] API call failed:', error);
    // Don't rethrow - let Mission Control continue
  }
}
```

### 4. Use Environment Variables

Store sensitive data in `.env`:

```javascript
async function init(context) {
  if (!process.env.API_KEY) {
    context.error('Missing API_KEY environment variable');
    return;
  }
  // Initialize with API_KEY
}
```

### 5. Log Important Events

Use the context logger for visibility:

```javascript
async function onTaskCreated(task) {
  context.log('Processing task:', task.id);
  // ...
  context.log('Task processed successfully');
}
```

### 6. Disable for Testing

Set `"enabled": false` in `plugin.json` to temporarily disable:

```json
{
  "id": "my-plugin",
  "enabled": false
}
```

## Troubleshooting

### Plugin Not Loading

**Check the server console** for error messages:

```
[Plugins] Discovering plugins in /path/to/mission-control/plugins...
[Plugins] Found 1 potential plugin(s)
[Plugins] ✓ Loaded plugin: My Plugin (1.0.0)
[Plugins] Successfully loaded 1/1 plugin(s)
```

**Common issues:**
- Missing `plugin.json` or `index.js`
- Syntax errors in JavaScript
- `"enabled": false` in manifest
- Plugin ID conflicts

### Plugin Not Executing

- Verify hooks are exported in `module.exports`
- Check for JavaScript errors in hook functions
- Ensure hook names match exactly (case-sensitive)

### Testing Plugins

Create a test task via API:

```bash
curl -X POST http://localhost:3001/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Test Task",
    "priority": "urgent"
  }'
```

Watch the console for your plugin's log output.

### Reloading Plugins

Restart the dev server:

```bash
# Stop server (Ctrl+C)
npm run dev
```

Or use the reload API (if implemented):

```bash
curl -X POST http://localhost:3001/api/plugins/reload
```

## Architecture Notes

- **Auto-discovery:** Plugins are loaded from `/plugins/` on server start
- **Safe execution:** Plugin errors don't crash the server
- **Event-driven:** Hooks are called after SSE broadcasts
- **Async support:** Hooks can be async or sync
- **Git-ignored:** `/plugins/` is in `.gitignore` (user-specific extensions)

## Need Help?

- Check the example `hello-world` plugin in `/plugins/hello-world/`
- Review server console logs for error messages
- Open an issue in the Mission Control repository

---

**Happy plugin building!** 🚀
