#!/usr/bin/env node
/**
 * Spawn an architect session for planning a task
 * Called by architect-spawner.ts
 */

const { spawn } = require('child_process');

const taskId = process.argv[2];
const taskTitle = process.argv[3];
const apiBase = process.env.API_BASE || 'http://192.168.1.79:3001';

if (!taskId || !taskTitle) {
  console.error('Usage: spawn-architect-session.js <taskId> <taskTitle>');
  process.exit(1);
}

const taskMessage = `🏗️ AUTONOMOUS PLANNING MODE

Task ID: ${taskId}
Task: ${taskTitle}

INSTRUCTIONS:
1. GET ${apiBase}/api/tasks/${taskId} for full task details
2. Create a complete planning spec autonomously - DO NOT ask questions
3. Make reasonable assumptions based on the task description

Planning Spec Format:
---
## Overview
[Brief summary of what needs to be done]

## Assumptions
[List any assumptions you're making based on the description]

## Implementation Plan
[Specific steps to implement this task]

## Technical Considerations
[Technologies, patterns, constraints to consider]

## Success Criteria
[How to verify this task is complete]

## Risks & Unknowns
[Potential issues or areas needing clarification]
---

4. When spec is complete:
   - POST the spec to ${apiBase}/api/tasks/${taskId}/activities (activity_type: "planning", message: your spec)
   - PATCH ${apiBase}/api/tasks/${taskId} with {"planning_complete": 1}

If the task description is genuinely insufficient to create ANY reasonable spec, note that in your spec under "Risks & Unknowns" and still mark planning_complete=1 so a human can review.

Be thorough but concise. Execute autonomously.`;

// Use openclaw via stdin messaging
const proc = spawn('openclaw', ['chat', '--agent', 'main'], {
  stdio: ['pipe', 'inherit', 'inherit']
});

proc.stdin.write(taskMessage + '\n');
proc.stdin.end();

proc.on('close', (code) => {
  process.exit(code || 0);
});
