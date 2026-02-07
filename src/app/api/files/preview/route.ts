/**
 * File Preview API
 * Serves local files for preview (HTML only for security)
 */

import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import {
  withErrorHandler,
  badRequest,
  forbidden,
  notFound,
  getRequiredSearchParam
} from '@/lib/api-utils';

export const GET = withErrorHandler(async (request) => {
  const filePathParam = getRequiredSearchParam(request, 'path');
  if (filePathParam instanceof NextResponse) return filePathParam;
  
  const filePath = filePathParam;

  // Only allow HTML files
  if (!filePath.endsWith('.html') && !filePath.endsWith('.htm')) {
    return badRequest('Only HTML files can be previewed');
  }

  // Expand tilde and normalize
  const expandedPath = filePath.replace(/^~/, process.env.HOME || '');
  const normalizedPath = path.normalize(expandedPath);

  // Security check - only allow paths from environment config
  const allowedPaths = [
    process.env.WORKSPACE_BASE_PATH?.replace(/^~/, process.env.HOME || ''),
    process.env.PROJECTS_PATH?.replace(/^~/, process.env.HOME || ''),
  ].filter(Boolean) as string[];

  const isAllowed = allowedPaths.some(allowed =>
    normalizedPath.startsWith(path.normalize(allowed))
  );

  if (!isAllowed) {
    return forbidden('Path not allowed');
  }

  if (!existsSync(normalizedPath)) {
    return notFound('File');
  }

  const content = readFileSync(normalizedPath, 'utf-8');
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/html',
    },
  });
});
