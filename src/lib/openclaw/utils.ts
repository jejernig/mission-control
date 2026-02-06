/**
 * OpenClaw utility functions
 * Shared helpers for working with OpenClaw API and data
 */

import { getOpenClawClient } from './client';

/**
 * Extract JSON from a response that might have markdown code blocks or surrounding text
 * Tries multiple strategies to extract valid JSON
 * 
 * @example
 * const json = extractJSON('Here is the data: ```json\n{"key": "value"}\n```');
 * // Returns: { key: "value" }
 */
export function extractJSON(text: string): object | null {
  // First, try direct parse
  try {
    return JSON.parse(text.trim());
  } catch {
    // Continue to other methods
  }

  // Try to extract from markdown code block (```json ... ``` or ``` ... ```)
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // Continue
    }
  }

  // Try to find JSON object in the text (first { to last })
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      // Continue
    }
  }

  // Try to find JSON array in the text (first [ to last ])
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(text.slice(firstBracket, lastBracket + 1));
    } catch {
      // Continue
    }
  }

  return null;
}

/**
 * Get messages from OpenClaw API session
 * Fetches message history and extracts assistant messages
 * 
 * @param sessionKey - The OpenClaw session key (e.g., "agent:main:planning:task-123")
 * @param limit - Maximum number of messages to retrieve (default: 20)
 * @returns Array of messages with role and content
 */
export async function getMessagesFromOpenClaw(
  sessionKey: string,
  limit: number = 20
): Promise<Array<{ role: string; content: string }>> {
  try {
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }
    
    // Use chat.history API to get session messages
    const result = await client.call<{ 
      messages: Array<{ 
        role: string; 
        content: Array<{ type: string; text?: string }> 
      }> 
    }>('chat.history', {
      sessionKey,
      limit,
    });
    
    const messages: Array<{ role: string; content: string }> = [];
    
    for (const msg of result.messages || []) {
      if (msg.role === 'assistant') {
        // Extract text content from assistant messages
        const textContent = msg.content?.find((c) => c.type === 'text');
        if (textContent?.text) {
          messages.push({
            role: 'assistant',
            content: textContent.text
          });
        }
      }
    }
    
    console.log('[OpenClaw] Found', messages.length, 'assistant messages via API');
    return messages;
  } catch (err) {
    console.error('[OpenClaw] Failed to get messages:', err);
    return [];
  }
}

/**
 * Get all messages (including user messages) from OpenClaw session
 * 
 * @param sessionKey - The OpenClaw session key
 * @param limit - Maximum number of messages to retrieve (default: 20)
 * @returns Array of all messages with role and content
 */
export async function getAllMessages(
  sessionKey: string,
  limit: number = 20
): Promise<Array<{ role: string; content: string }>> {
  try {
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }
    
    const result = await client.call<{ 
      messages: Array<{ 
        role: string; 
        content: Array<{ type: string; text?: string }> 
      }> 
    }>('chat.history', {
      sessionKey,
      limit,
    });
    
    const messages: Array<{ role: string; content: string }> = [];
    
    for (const msg of result.messages || []) {
      const textContent = msg.content?.find((c) => c.type === 'text');
      if (textContent?.text) {
        messages.push({
          role: msg.role,
          content: textContent.text
        });
      }
    }
    
    return messages;
  } catch (err) {
    console.error('[OpenClaw] Failed to get all messages:', err);
    return [];
  }
}

/**
 * Parse OpenClaw session key components
 * 
 * @example
 * parseSessionKey("agent:main:planning:task-123")
 * // Returns: { type: "agent", name: "main", scope: "planning", id: "task-123" }
 */
export function parseSessionKey(sessionKey: string): {
  type?: string;
  name?: string;
  scope?: string;
  id?: string;
} {
  const parts = sessionKey.split(':');
  return {
    type: parts[0],
    name: parts[1],
    scope: parts[2],
    id: parts[3],
  };
}

/**
 * Build OpenClaw session key from components
 */
export function buildSessionKey(
  type: string,
  name: string,
  scope: string,
  id: string
): string {
  return `${type}:${name}:${scope}:${id}`;
}

/**
 * Check if an OpenClaw session key is valid format
 */
export function isValidSessionKey(sessionKey: string): boolean {
  const parts = sessionKey.split(':');
  return parts.length >= 3; // Minimum: type:name:scope
}
