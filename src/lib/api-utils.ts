/**
 * Shared API utilities for Next.js route handlers
 * Eliminates duplicate error handling, response formatting, and validation
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Standard API error response
 */
export function apiError(message: string, status: number = 500) {
  console.error(`[API Error ${status}]`, message);
  return NextResponse.json({ error: message }, { status });
}

/**
 * Standard API success response
 */
export function apiSuccess<T>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Common error status codes
 */
export const ErrorStatus = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER: 500,
} as const;

/**
 * Higher-order function to wrap route handlers with error handling
 * Eliminates repetitive try-catch blocks
 * 
 * @example
 * export const GET = withErrorHandler(async (request, context) => {
 *   const { id } = await context.params;
 *   const data = queryOne('SELECT * FROM tasks WHERE id = ?', [id]);
 *   if (!data) return apiError('Task not found', ErrorStatus.NOT_FOUND);
 *   return apiSuccess(data);
 * });
 */
export function withErrorHandler<TContext = unknown>(
  handler: (request: Request, context: TContext) => Promise<NextResponse>
) {
  return async (request: Request, context: TContext): Promise<NextResponse> => {
    try {
      return await handler(request, context);
    } catch (error) {
      console.error('Route handler error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      return apiError(message, ErrorStatus.INTERNAL_SERVER);
    }
  };
}

/**
 * Validate request body against Zod schema
 * Returns parsed data or NextResponse error
 * 
 * @example
 * const result = await validateBody(request, z.object({ title: z.string() }));
 * if (result instanceof NextResponse) return result; // Error response
 * const { title } = result; // Validated data
 */
export async function validateBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<z.infer<T> | NextResponse> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);
    
    if (!result.success) {
      const issues = result.error.issues || [];
      const errors = issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return apiError(`Validation failed: ${errors}`, ErrorStatus.BAD_REQUEST);
    }
    
    return result.data;
  } catch (error) {
    return apiError('Invalid JSON body', ErrorStatus.BAD_REQUEST);
  }
}

/**
 * Safely get search param from URL
 */
export function getSearchParam(
  request: Request,
  key: string,
  defaultValue?: string
): string | undefined {
  const { searchParams } = new URL(request.url);
  return searchParams.get(key) ?? defaultValue;
}

/**
 * Get required search param or return error response
 */
export function getRequiredSearchParam(
  request: Request,
  key: string
): string | NextResponse {
  const value = getSearchParam(request, key);
  if (!value) {
    return apiError(`Missing required parameter: ${key}`, ErrorStatus.BAD_REQUEST);
  }
  return value;
}

/**
 * Parse search params into object with optional validation
 */
export function parseSearchParams(request: Request, keys: string[]): Record<string, string | null> {
  const { searchParams } = new URL(request.url);
  const result: Record<string, string | null> = {};
  
  for (const key of keys) {
    result[key] = searchParams.get(key);
  }
  
  return result;
}

/**
 * Check if entity exists, return error response if not
 * 
 * @example
 * const task = queryOne('SELECT * FROM tasks WHERE id = ?', [id]);
 * const errorResponse = checkEntityExists(task, 'Task');
 * if (errorResponse) return errorResponse;
 * // task is guaranteed to exist here
 */
export function checkEntityExists<T>(
  entity: T | null | undefined,
  entityName: string
): NextResponse | null {
  if (!entity) {
    return apiError(`${entityName} not found`, ErrorStatus.NOT_FOUND);
  }
  return null;
}

/**
 * Build SQL UPDATE statement dynamically from partial object
 * Returns { clause, values } for use in parameterized queries
 * 
 * @example
 * const { clause, values } = buildUpdateClause({ name: 'New Name', status: 'active' });
 * // clause: 'name = ?, status = ?'
 * // values: ['New Name', 'active']
 */
export function buildUpdateClause(
  updates: Record<string, unknown>
): { clause: string; values: unknown[] } {
  const entries = Object.entries(updates).filter(([_, value]) => value !== undefined);
  
  if (entries.length === 0) {
    return { clause: '', values: [] };
  }
  
  const clause = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([_, value]) => value);
  
  return { clause, values };
}

/**
 * Extract route params safely
 * 
 * @example
 * export const GET = withErrorHandler(async (request, context) => {
 *   const { id } = await extractParams<{ id: string }>(context);
 *   // ...
 * });
 */
export async function extractParams<T extends Record<string, string>>(
  context: { params: Promise<T> | T }
): Promise<T> {
  if (context.params instanceof Promise) {
    return await context.params;
  }
  return context.params;
}

/**
 * Create a standardized "not found" response
 */
export const notFound = (entityName: string) => 
  apiError(`${entityName} not found`, ErrorStatus.NOT_FOUND);

/**
 * Create a standardized "bad request" response
 */
export const badRequest = (message: string) => 
  apiError(message, ErrorStatus.BAD_REQUEST);

/**
 * Create a standardized "forbidden" response
 */
export const forbidden = (message: string = 'Forbidden') => 
  apiError(message, ErrorStatus.FORBIDDEN);

/**
 * Create a standardized "unauthorized" response
 */
export const unauthorized = (message: string = 'Unauthorized') => 
  apiError(message, ErrorStatus.UNAUTHORIZED);
