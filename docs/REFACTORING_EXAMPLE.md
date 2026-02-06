# Refactoring Examples - Before & After

## Example 1: API Route Handler

### File: `src/app/api/agents/[id]/route.ts`

#### BEFORE (Original - 147 lines)
```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    return NextResponse.json(agent);
  } catch (error) {
    console.error('Failed to fetch agent:', error);
    return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 });
  }
}
```

#### AFTER (Refactored - 107 lines, -27% code)
```typescript
import { withErrorHandler, apiSuccess, checkEntityExists, extractParams } from '@/lib/api-utils';

export const GET = withErrorHandler(async (request, context) => {
  const { id } = await extractParams<{ id: string }>(context);
  const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);

  const error = checkEntityExists(agent, 'Agent');
  if (error) return error;

  return apiSuccess(agent);
});
```

**Benefits:**
- ✅ Eliminated try-catch boilerplate
- ✅ Consistent error handling
- ✅ 40% fewer lines in GET handler
- ✅ Automatic error logging
- ✅ Type-safe responses

---

## Example 2: Client Component Formatting

### File: `src/components/SessionsList.tsx`

#### BEFORE (Duplicate Functions)
```typescript
// DUPLICATE #1: formatTimestamp (also in ActivityLog.tsx, DeliverablesList.tsx)
const formatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

// DUPLICATE #2: formatDuration (also in GlobalSessionsPanel.tsx)
const formatDuration = (start: string, end?: string | null) => {
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const duration = endTime - startTime;

  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};

// DUPLICATE #3: formatTokens (also in GlobalSessionsPanel.tsx)
const formatTokens = (tokens?: number) => {
  if (!tokens) return null;
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M tokens`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K tokens`;
  }
  return `${tokens} tokens`;
};
```

#### AFTER (Shared Utilities)
```typescript
import { formatTimestamp, formatDuration, formatTokens } from '@/lib/client-utils';

// Use directly - no local function definitions needed
// formatTimestamp(timestamp)
// formatDuration(start, end)
// formatTokens(tokens)
```

**Benefits:**
- ✅ Removed ~45 lines of duplicate code
- ✅ Single source of truth for formatting
- ✅ Easy to update behavior globally
- ✅ Consistent formatting across all components
- ✅ Easier to test

**Impact Across Files:**
- `ActivityLog.tsx`: Remove 30 lines
- `SessionsList.tsx`: Remove 45 lines
- `GlobalSessionsPanel.tsx`: Remove 35 lines
- `DeliverablesList.tsx`: Remove 30 lines
- **Total saved: ~140 lines**

---

## Example 3: OpenClaw Utilities

### Files: Planning route handlers

#### BEFORE (Duplicated in 2 files)
```typescript
// src/app/api/tasks/[id]/planning/route.ts
function extractJSON(text: string): object | null {
  try {
    return JSON.parse(text.trim());
  } catch {
    // Continue to other methods
  }

  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // Continue
    }
  }
  
  // ... 20+ more lines
}

async function getMessagesFromOpenClaw(sessionKey: string): Promise<Array<{ role: string; content: string }>> {
  try {
    const client = getOpenClawClient();
    // ... 30+ more lines
  } catch (err) {
    console.error('[Planning] Failed to get messages:', err);
    return [];
  }
}
```

#### AFTER (Centralized)
```typescript
import { extractJSON, getMessagesFromOpenClaw } from '@/lib/openclaw/utils';

// Use directly - utilities handle all edge cases
const data = extractJSON(responseText);
const messages = await getMessagesFromOpenClaw(sessionKey);
```

**Benefits:**
- ✅ Removed ~60 lines of duplicate code per file
- ✅ Better error handling in centralized version
- ✅ Support for arrays added to extractJSON
- ✅ Reusable in future OpenClaw integrations

---

## Code Reduction Summary

| File Type | Files | Lines Saved | % Reduction |
|-----------|-------|-------------|-------------|
| API Routes (34 files) | 34 | ~800 | ~40% |
| Client Components (6 files) | 6 | ~140 | ~25% |
| OpenClaw Routes (2 files) | 2 | ~120 | ~50% |
| **Total** | **42** | **~1,060** | **~35%** |

---

## Testing Verification

After refactoring each file:

### API Routes
```bash
# Test GET
curl http://localhost:3001/api/agents/some-id

# Test PATCH
curl -X PATCH http://localhost:3001/api/agents/some-id \
  -H 'Content-Type: application/json' \
  -d '{"name": "Updated Name"}'

# Test DELETE
curl -X DELETE http://localhost:3001/api/agents/some-id
```

### Client Components
1. Start dev server: `npm run dev`
2. Open browser to affected pages
3. Verify formatting displays correctly
4. Check browser console for errors

### Build Verification
```bash
npm run lint
npm run build
```

---

## Progressive Refactoring Strategy

### Phase 1: Foundation (Done ✅)
- [x] Create `api-utils.ts`
- [x] Create `client-utils.ts`
- [x] Create `openclaw/utils.ts`
- [x] Document refactoring patterns

### Phase 2: Pilot Refactoring (Recommended)
Apply to 3-5 files first to validate approach:
- [ ] `src/app/api/agents/[id]/route.ts`
- [ ] `src/app/api/tasks/[id]/route.ts`
- [ ] `src/components/SessionsList.tsx`
- [ ] Test thoroughly
- [ ] Adjust utilities if needed

### Phase 3: Bulk Refactoring
Once pilot is successful:
- [ ] All API routes (34 files)
- [ ] All client components (6 files)
- [ ] All OpenClaw integrations (2 files)

### Phase 4: Cleanup
- [ ] Remove commented-out old code
- [ ] Update documentation
- [ ] Final testing pass

---

## Rollback Safety

Each commit is atomic and can be reverted:
```bash
# Revert last commit
git revert HEAD

# Revert specific file
git checkout HEAD~1 -- src/app/api/agents/[id]/route.ts
```

---

## Maintenance Benefits

### Before Refactoring:
- Want to change error format? Update 151 locations
- Want to improve timestamp formatting? Update 6 components
- Want to add logging? Update 72 try-catch blocks

### After Refactoring:
- Change error format: Update `apiError()` in api-utils.ts ✨
- Improve timestamp formatting: Update `formatTimestamp()` in client-utils.ts ✨
- Add logging: Update `withErrorHandler()` in api-utils.ts ✨

**Result:** One change propagates everywhere, eliminating maintenance burden.
