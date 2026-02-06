# Session Completion Hook - Fix Documentation

**Date:** 2026-02-06  
**Task:** c24e50a7-e30c-4818-94a8-f565ec9d57a2  
**Issue:** Session completion hook not firing on spawned subagent sessions

## Problem

The session completion hook (`src/lib/openclaw/session-completion-hook.ts`) was correctly implemented but never being triggered when OpenClaw subagent sessions completed. This meant that:
- No automatic activity logs were posted when agents finished tasks
- Manual reporting was required for every completed session  
- The UI showed incomplete task status

**Root Cause:** The hook was only called when the `PATCH /api/openclaw/sessions/[id]` endpoint was hit, but nothing was automatically calling this endpoint when OpenClaw sessions ended.

## Solution

Created a background **Session Monitor Service** that:
1. Periodically polls OpenClaw Gateway for active sessions (every 30 seconds)
2. Compares live sessions with the database to detect completed sessions  
3. Automatically updates session status and triggers the completion hook
4. Posts auto-generated activity logs with deliverables summary

### Files Created

1. **`src/lib/openclaw/session-monitor.ts`**
   - SessionMonitor class with start/stop/check methods
   - Polls OpenClaw and compares with DB sessions
   - Triggers `onSessionComplete` hook for ended sessions
   - Singleton pattern with `getSessionMonitor()` / `startSessionMonitor()`

2. **`src/instrumentation.ts`**
   - Next.js instrumentation hook
   - Auto-starts session monitor on server startup
   - Runs in Node.js runtime only

### Files Modified

1. **`next.config.mjs`**
   - Already had `instrumentationHook: true` enabled ✓

2. **`src/lib/openclaw/session-completion-hook.ts`**
   - Added detailed console.log tracing for debugging
   - No logic changes - hook was already correct

### Bugs Fixed During Implementation

1. **Database Schema Issue**
   - Monitor queried `started_at` column that didn't exist
   - Fixed to use `created_at` instead

2. **OpenClaw Response Type**
   - `client.listSessions()` returns object with `sessions` array, not direct array
   - Added type guard to handle both formats

## Testing

### Manual Verification Steps

1. **Start Mission Control:**
   ```bash
   cd ~/source/mission-control
   npm run dev
   ```

2. **Check logs for monitor startup:**
   ```
   [Instrumentation] Initializing Mission Control services...
   [SessionMonitor] Starting session monitor (polling every 30000ms)
   [SessionMonitor] Checking X active session(s)
   ```

3. **Spawn a test subagent session and complete it**

4. **Verify hook fires:**
   ```
   [SessionMonitor] Session agent:xxx:subagent:yyy has ended
   [SessionMonitor] Updated session xxx to completed
   [SessionMonitor] Triggering completion hook for task zzz
   [Session Hook] ======================================== 
   [Session Hook] TRIGGERED for session: agent:xxx:subagent:yyy
   [Session Hook] Auto-posted completion for agent xxx on task zzz
   ```

5. **Check Mission Control UI:**
   - Task should show auto-generated activity log
   - Activity should mention deliverables (if any)
   - Message should @mention jarvis

### Expected Log Output

```
[SessionMonitor] Checking 2 active session(s)
[SessionMonitor] Found 33 live OpenClaw session(s)
[SessionMonitor] Session agent:backend-worker:subagent:xxx has ended
[SessionMonitor] Updated session yyy to completed  
[Session Hook] ======================================== 
[Session Hook] TRIGGERED for session: agent:backend-worker:subagent:xxx
[Session Hook] Task ID: c24e50a7-e30c-4818-94a8-f565ec9d57a2
[Session Hook] Agent ID: backend-worker
[Session Hook] Status: completed
[Session Hook] Auto-posted completion for agent backend-worker on task c24e50a7...
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Next.js Server Startup                                   │
│  └─ instrumentation.ts                                   │
│      └─ startSessionMonitor()                            │
└───────────────┬─────────────────────────────────────────┘
                │
                v
┌───────────────────────────────────────────────────────────┐
│ SessionMonitor (30s poll interval)                        │
│  ├─ Get active DB sessions (status='active')              │
│  ├─ Get live OpenClaw sessions via Gateway API            │
│  └─ Compare: DB sessions not in live = completed          │
└───────────────┬───────────────────────────────────────────┘
                │
                v (when session ends)
┌───────────────────────────────────────────────────────────┐
│ handleCompletedSession()                                   │
│  ├─ UPDATE openclaw_sessions SET status='completed'       │
│  ├─ UPDATE agents SET status='idle'                       │
│  └─ Call onSessionComplete(db, context)                   │
└───────────────┬───────────────────────────────────────────┘
                │
                v
┌───────────────────────────────────────────────────────────┐
│ onSessionComplete() - Existing Hook                       │
│  ├─ Check if agent already reported (last 2 min)          │
│  ├─ Query deliverables logged during session              │
│  ├─ Build auto-report message with @jarvis mention        │
│  ├─ INSERT INTO task_activities (type='comment')          │
│  └─ broadcast('activity_logged') for real-time UI         │
└───────────────────────────────────────────────────────────┘
```

## Configuration

- **Poll Interval:** 30 seconds (configurable in SessionMonitor constructor)
- **Recent Activity Window:** 2 minutes (prevents duplicate reports if agent manually posted)
- **Auto-Start:** Enabled via `src/instrumentation.ts`

## Maintenance

### To disable the monitor temporarily:
```typescript
import { stopSessionMonitor } from '@/lib/openclaw/session-monitor';
stopSessionMonitor();
```

### To change poll interval:
Modify `session-monitor.ts` constructor default or pass value to `new SessionMonitor(60000)` for 60s.

### Monitoring health:
Check server logs for:
- `[SessionMonitor] Starting...` on startup
- `[SessionMonitor] Checking N active session(s)` every 30s
- `[SessionMonitor] Error...` for failures

## Future Enhancements

1. **OpenClaw Event Integration**
   - Listen for `session.ended` events instead of polling (when available)
   - Would eliminate 30-second delay

2. **Configurable via UI**
   - Enable/disable monitor
   - Adjust poll interval  
   - View monitor status/last check time

3. **Alert on Failures**
   - Notify admins if monitor fails repeatedly
   - Dashboard widget showing monitor health

## Related Files

- `src/lib/openclaw/client.ts` - OpenClaw Gateway WebSocket client
- `src/app/api/openclaw/sessions/[id]/route.ts` - Session PATCH endpoint
- `src/app/api/tasks/[id]/subagent/route.ts` - Subagent registration
- `src/lib/db/migrations/*` - Database schema

## References

- Task: c24e50a7-e30c-4818-94a8-f565ec9d57a2
- Original Spec: INFRASTRUCTURE_SESSION_COMPLETION.md (if exists)
- Next.js Instrumentation: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
