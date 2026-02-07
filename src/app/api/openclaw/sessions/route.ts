import { getOpenClawClient } from '@/lib/openclaw/client';
import { queryAll } from '@/lib/db';
import type { OpenClawSession } from '@/lib/types';
import { withErrorHandler, getSearchParam, apiSuccess, apiError, ErrorStatus } from '@/lib/api-utils';

// GET /api/openclaw/sessions - List OpenClaw sessions
export const GET = withErrorHandler(async (request) => {
  const sessionType = getSearchParam(request, 'session_type');
  const status = getSearchParam(request, 'status');

  // If filtering by database fields, query the database
  if (sessionType || status) {
    let sql = 'SELECT * FROM openclaw_sessions WHERE 1=1';
    const params: unknown[] = [];

    if (sessionType) {
      sql += ' AND session_type = ?';
      params.push(sessionType);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';

    const sessions = queryAll<OpenClawSession>(sql, params);
    return apiSuccess(sessions);
  }

  // Otherwise, query OpenClaw Gateway for live sessions
  const client = getOpenClawClient();

  if (!client.isConnected()) {
    try {
      await client.connect();
    } catch {
      return apiError('Failed to connect to OpenClaw Gateway', ErrorStatus.SERVICE_UNAVAILABLE);
    }
  }

  const sessions = await client.listSessions();
  return apiSuccess({ sessions });
});

// POST /api/openclaw/sessions - Create a new OpenClaw session
export const POST = withErrorHandler(async (request) => {
  const body = await request.json();
  const { channel, peer } = body;

  if (!channel) {
    return apiError('channel is required', ErrorStatus.BAD_REQUEST);
  }

  const client = getOpenClawClient();

  if (!client.isConnected()) {
    try {
      await client.connect();
    } catch {
      return apiError('Failed to connect to OpenClaw Gateway', ErrorStatus.SERVICE_UNAVAILABLE);
    }
  }

  const session = await client.createSession(channel, peer);
  return apiSuccess({ session }, 201);
});
