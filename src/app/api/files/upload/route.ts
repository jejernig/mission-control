/**
 * File Upload API
 * Accepts file content over HTTP and saves it to the server filesystem.
 * This enables remote agents to create files on
 * the Mission Control server.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { withErrorHandler, badRequest, apiSuccess } from '@/lib/api-utils';

// Base directory for all uploaded project files
// Set via PROJECTS_PATH env var (e.g., ~/projects or /var/www/projects)
const PROJECTS_BASE = (process.env.PROJECTS_PATH || '~/projects').replace(/^~/, process.env.HOME || '');

interface UploadRequest {
  // Path relative to PROJECTS_BASE (e.g., "dashboard-redesign/index.html")
  relativePath: string;
  // File content (text)
  content: string;
  // Optional: encoding (default: utf-8)
  encoding?: BufferEncoding;
}

/**
 * POST /api/files/upload
 * Upload a file to the server
 */
export const POST = withErrorHandler(async (request) => {
  const body: UploadRequest = await request.json();
  const { relativePath, content, encoding = 'utf-8' } = body;

  if (!relativePath || content === undefined) {
    return badRequest('relativePath and content are required');
  }

  // Security: Prevent path traversal attacks
  const normalizedPath = path.normalize(relativePath);
  if (normalizedPath.startsWith('..') || normalizedPath.startsWith('/')) {
    return badRequest('Invalid path: must be relative and cannot traverse upward');
  }

  // Build full path
  const fullPath = path.join(PROJECTS_BASE, normalizedPath);

  // Ensure base directory exists
  if (!existsSync(PROJECTS_BASE)) {
    mkdirSync(PROJECTS_BASE, { recursive: true });
  }

  // Ensure parent directory exists
  const parentDir = path.dirname(fullPath);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  // Write the file
  writeFileSync(fullPath, content, { encoding });

  console.log(`[FILE UPLOAD] Created: ${fullPath}`);

  return apiSuccess({
    success: true,
    path: fullPath,
    relativePath: normalizedPath,
    size: Buffer.byteLength(content, encoding),
  }, 201);
});

/**
 * GET /api/files/upload
 * Get info about the upload endpoint
 */
export const GET = withErrorHandler(async () => {
  return apiSuccess({
    description: 'File upload endpoint for remote agents',
    basePath: PROJECTS_BASE,
    usage: {
      method: 'POST',
      body: {
        relativePath: 'project-name/filename.html',
        content: '<html>...</html>',
        encoding: 'utf-8 (optional)',
      },
    },
  });
});
