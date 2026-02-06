# Duplicate Function Analysis - Mission Control

**Generated:** 2026-02-06  
**Task:** fe6adbf3-62e2-40d5-aab7-72776a991d6a

## Executive Summary

Found **234 total functions** with **15 duplicate function names** and **414 common pattern occurrences** across 110 TypeScript files.

## Critical Duplicates

### 1. HTTP Route Handlers (64 instances)
- **GET**: 29 instances across API routes
- **POST**: 25 instances across API routes  
- **PATCH**: 5 instances
- **DELETE**: 5 instances

**Pattern**: Every Next.js API route has repetitive error handling, parameter validation, and response formatting.

### 2. Error Response Pattern (151 occurrences)
`NextResponse.json({ error: ... })` appears 151 times across 34 files.

**Top offenders:**
- `app/api/openclaw/sessions/[id]/route.ts` (11)
- `app/api/agents/[id]/openclaw/route.ts` (10)
- `app/api/workspaces/[id]/route.ts` (9)
- `app/api/tasks/[id]/route.ts` (8)

### 3. Try-Catch Blocks (146 occurrences)
Repetitive try-catch error handling across 72 files.

### 4. Client Component Utilities

#### Duplicate across components:
- **handleDelete** (4 instances): `AgentModal`, `SessionsList`, `TaskModal`, `WorkspaceDashboard`
- **handleSubmit** (3 instances): `AgentModal`, `TaskModal`, `WorkspaceDashboard`
- **formatTimestamp** (3 instances): `ActivityLog`, `SessionsList`, `DeliverablesList`
- **formatDuration** (2 instances): `GlobalSessionsPanel`, `SessionsList`
- **formatTokens** (2 instances): `GlobalSessionsPanel`, `SessionsList`

#### Duplicate API-specific utilities:
- **extractJSON** (2 instances): `tasks/[id]/planning/route.ts`, `tasks/[id]/planning/answer/route.ts`
- **getMessagesFromOpenClaw** (2 instances): Same files as above

### 5. Request/Response Patterns
- **Request.json()**: 23 occurrences across 22 files
- **searchParams.get**: 22 occurrences across 10 files
- **URL params**: 49 occurrences across 8 files

## Files with Highest Duplication Potential

| File | Pattern Count |
|------|---------------|
| `lib/charlie-orchestration.ts` | 37 |
| `app/api/tasks/[id]/planning/route.ts` | 17 |
| `app/api/openclaw/sessions/[id]/route.ts` | 17 |
| `app/api/tasks/route.ts` | 15 |
| `app/api/agents/[id]/openclaw/route.ts` | 14 |

## Recommended Refactoring Strategy

### Phase 1: API Utilities (High Impact)
Create `src/lib/api-utils.ts`:
- `apiError(message, status)` - standardized error responses
- `apiSuccess(data, status)` - standardized success responses
- `withErrorHandler(handler)` - HOF for try-catch wrapping
- `validateParams(schema)` - Zod validation wrapper
- `getSearchParam(url, key, defaultValue)` - safe search param access

### Phase 2: Client Utilities (Medium Impact)
Create `src/lib/client-utils.ts`:
- `formatTimestamp(date)` - consistent timestamp formatting
- `formatDuration(ms)` - duration formatting
- `formatTokens(count)` - token count formatting

Create `src/lib/hooks/`:
- `useDelete(endpoint, onSuccess)` - reusable delete handler
- `useSubmit(endpoint, onSuccess)` - reusable submit handler

### Phase 3: OpenClaw Utilities (Low Impact)
Consolidate in `src/lib/openclaw/utils.ts`:
- `extractJSON(text)` - JSON extraction from text
- `getMessagesFromOpenClaw(sessionId)` - fetch messages from OpenClaw

### Phase 4: Component Refactoring
Extract shared logic from:
- Modal components → `src/components/shared/BaseModal.tsx`
- List components → `src/components/shared/BaseList.tsx`

## Expected Impact

- **Lines of code reduced**: ~400-600 lines
- **Files affected**: ~50 files
- **Maintenance burden**: Significantly reduced
- **Type safety**: Improved with centralized utilities
- **Testing**: Easier to test centralized functions

## Testing Strategy

1. Create unit tests for all new utilities
2. Run existing test suite before refactoring
3. Verify API routes still work with Postman/curl
4. Check UI components render correctly
5. Integration test critical flows

## Risk Assessment

**Low Risk:**
- Utility function extraction (pure functions)
- Client-side formatting functions

**Medium Risk:**
- API error handling changes (need careful testing)
- Component refactoring (UI regression risk)

**Mitigation:**
- Feature branch with incremental commits
- Test after each utility extraction
- Keep old code commented during transition
