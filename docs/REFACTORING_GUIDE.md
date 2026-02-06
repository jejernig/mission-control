# Refactoring Guide - Duplicate Function Elimination

**Task ID:** fe6adbf3-62e2-40d5-aab7-72776a991d6a  
**Date:** 2026-02-06  
**Status:** In Progress

## Overview

This document provides step-by-step instructions for refactoring duplicated functions across the Mission Control codebase.

## New Utility Modules Created

### 1. `src/lib/api-utils.ts` - API Route Helpers

**Purpose:** Eliminate 151 duplicate error responses and 146 try-catch blocks

**Key Functions:**
- `apiError(message, status)` - Standard error responses
- `apiSuccess(data, status)` - Standard success responses
- `withErrorHandler(handler)` - HOF for automatic try-catch wrapping
- `checkEntityExists(entity, name)` - Standard 404 checking
- `extractParams(context)` - Safe param extraction
- `buildUpdateClause(updates)` - Dynamic SQL UPDATE generation

### 2. `src/lib/client-utils.ts` - Client-Side Utilities

**Purpose:** Eliminate 15+ duplicate formatting functions

**Key Functions:**
- `formatTimestamp(timestamp)` - Relative time formatting
- `formatDuration(ms)` - Duration formatting  
- `formatTokens(count)` - Token count formatting (K/M)
- `getStatusColor(status)` - Status badge colors
- `parseSessionKey(key)` - Parse OpenClaw session keys

### 3. `src/lib/openclaw/utils.ts` - OpenClaw Helpers

**Purpose:** Centralize OpenClaw-specific utilities

**Key Functions:**
- `extractJSON(text)` - Extract JSON from markdown/text
- `getMessagesFromOpenClaw(sessionKey)` - Fetch session messages
- `getAllMessages(sessionKey)` - Fetch all message types
- `buildSessionKey(...)` - Construct session keys

## Refactoring Patterns

### Pattern 1: API Route Error Handling

**Before:**
```typescript
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    
    return NextResponse.json(task);
  } catch (error) {
    console.error('Failed to fetch task:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}
```

**After:**
```typescript
import { withErrorHandler, apiSuccess, checkEntityExists, extractParams } from '@/lib/api-utils';

export const GET = withErrorHandler(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);
  const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
  
  const error = checkEntityExists(task, 'Task');
  if (error) return error;
  
  return apiSuccess(task);
});
```

**Benefits:**
- Eliminates try-catch boilerplate
- Consistent error responses
- 50% fewer lines of code
- Easier to test

### Pattern 2: Component Formatting Functions

**Before (in 3 different components):**
```typescript
const formatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins} min${mins > 1 ? 's' : ''} ago`;
  }
  // ... more logic
};
```

**After:**
```typescript
import { formatTimestamp } from '@/lib/client-utils';

// Use directly: formatTimestamp(timestamp)
```

**Benefits:**
- Single source of truth
- Consistent formatting
- Easy to update behavior globally

### Pattern 3: OpenClaw JSON Extraction

**Before (in 2 route files):**
```typescript
function extractJSON(text: string): object | null {
  try {
    return JSON.parse(text.trim());
  } catch {
    // ... 30+ lines of fallback logic
  }
}
```

**After:**
```typescript
import { extractJSON } from '@/lib/openclaw/utils';

const data = extractJSON(responseText);
```

## Step-by-Step Refactoring Process

### Step 1: Refactor API Routes (High Priority)

Target files (sorted by impact):
1. `src/app/api/tasks/[id]/route.ts` (8 error responses)
2. `src/app/api/openclaw/sessions/[id]/route.ts` (11 error responses)
3. `src/app/api/agents/[id]/route.ts` (7 error responses)
4. All other API route files

**Process for each file:**
```bash
1. Add imports from api-utils
2. Wrap handler with withErrorHandler
3. Replace NextResponse.json error calls with apiError/checkEntityExists
4. Replace success responses with apiSuccess
5. Test the endpoint with curl/Postman
6. Commit
```

### Step 2: Refactor Client Components (Medium Priority)

Target files:
1. `src/components/ActivityLog.tsx` - formatTimestamp
2. `src/components/SessionsList.tsx` - formatTimestamp, formatDuration, formatTokens
3. `src/components/GlobalSessionsPanel.tsx` - formatDuration, formatTokens
4. `src/components/DeliverablesList.tsx` - formatTimestamp

**Process:**
```bash
1. Import from client-utils
2. Remove local function definitions
3. Update function calls (may need to adjust parameters)
4. Test UI renders correctly
5. Commit
```

### Step 3: Refactor OpenClaw Utilities (Low Priority)

Target files:
1. `src/app/api/tasks/[id]/planning/route.ts`
2. `src/app/api/tasks/[id]/planning/answer/route.ts`

**Process:**
```bash
1. Import from openclaw/utils
2. Remove duplicate function definitions
3. Test planning workflow
4. Commit
```

## Testing Checklist

After each refactoring commit:

- [ ] `npm run lint` passes (no new errors)
- [ ] `npm run build` succeeds
- [ ] API endpoints respond correctly (test with curl)
- [ ] UI components render without errors
- [ ] No console errors in browser dev tools

## Safety Measures

1. **Feature Branch**: Work in `feat/refactor-duplicates`
2. **Incremental Commits**: One file or group at a time
3. **Test After Each Change**: Verify before moving on
4. **Keep Backups**: Comment out old code initially, remove after testing

## Example Commits

```
feat: add shared API utilities for error handling

- Created src/lib/api-utils.ts with withErrorHandler, apiError, apiSuccess
- Eliminates need for 151 duplicate error responses
- Reduces boilerplate in route handlers

---

refactor: apply api-utils to tasks API routes

- Refactored src/app/api/tasks/[id]/route.ts
- Refactored src/app/api/tasks/route.ts
- Reduced code by ~40 lines per file
- Tested with curl, all endpoints working

---

feat: add shared client utilities for formatting

- Created src/lib/client-utils.ts
- Consolidates formatTimestamp, formatDuration, formatTokens
- Used by multiple components

---

refactor: apply client-utils to session components

- Updated SessionsList, GlobalSessionsPanel
- Removed duplicate formatting functions
- UI tested, no regressions
```

## Automated Refactoring Script

For bulk refactoring (use with caution):

```bash
# Find all API route files with duplicate patterns
find src/app/api -name "route.ts" -type f

# Run linter to check for issues
npm run lint

# Build to ensure no TypeScript errors
npm run build
```

## Rollback Plan

If issues arise:
```bash
git checkout feat/refactor-duplicates
git reset --hard <last-good-commit>
```

## Progress Tracking

- [x] Analysis completed (DUPLICATE_ANALYSIS.md)
- [x] Utility modules created
  - [x] api-utils.ts
  - [x] client-utils.ts
  - [x] openclaw/utils.ts
- [ ] API routes refactored (0/34 files)
- [ ] Client components refactored (0/6 files)
- [ ] OpenClaw utilities refactored (0/2 files)
- [ ] All tests passing
- [ ] Documentation updated

## Expected Results

**Before:**
- 234 functions (15 duplicate names)
- 414 pattern occurrences
- High maintenance burden

**After:**
- ~180 functions (minimal duplicates)
- ~100 pattern occurrences (centralized utilities)
- Low maintenance burden
- Better type safety
- Easier testing

## Questions & Issues

Document any issues encountered during refactoring:

1. **Issue:** [Description]
   **Resolution:** [How it was solved]

2. **Breaking Change:** [What changed]
   **Migration:** [How to update]
