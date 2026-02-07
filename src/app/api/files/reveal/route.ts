/**
 * File Reveal API
 * Opens a file's location in Finder (macOS) or Explorer (Windows)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import path from 'path';
import {
  withErrorHandler,
  badRequest,
  forbidden,
  notFound,
  apiSuccess,
} from '@/lib/api-utils';

const execAsync = promisify(exec);

export const POST = withErrorHandler(async (request) => {
  const { filePath } = await request.json();

  if (!filePath) {
    return badRequest('filePath is required');
  }

  // Expand tilde
  const expandedPath = filePath.replace(/^~/, process.env.HOME || '');

  // Security: Ensure path is within allowed directories (from env config)
  const allowedPaths = [
    process.env.WORKSPACE_BASE_PATH?.replace(/^~/, process.env.HOME || ''),
    process.env.PROJECTS_PATH?.replace(/^~/, process.env.HOME || ''),
  ].filter(Boolean) as string[];

  const normalizedPath = path.normalize(expandedPath);
  const isAllowed = allowedPaths.some(allowed =>
    normalizedPath.startsWith(path.normalize(allowed))
  );

  if (!isAllowed) {
    console.warn(`[FILE] Blocked access to: ${filePath}`);
    return forbidden('Path not in allowed directories');
  }

  // Check if file/directory exists
  if (!existsSync(normalizedPath)) {
    return notFound('File or directory');
  }

  // Open in Finder (macOS) - reveal the file
  const platform = process.platform;
  let command: string;

  if (platform === 'darwin') {
    command = `open -R "${normalizedPath}"`;
  } else if (platform === 'win32') {
    command = `explorer /select,"${normalizedPath}"`;
  } else {
    // Linux - open containing folder
    command = `xdg-open "${path.dirname(normalizedPath)}"`;
  }

  await execAsync(command);

  console.log(`[FILE] Revealed: ${normalizedPath}`);
  return apiSuccess({ success: true, path: normalizedPath });
});
