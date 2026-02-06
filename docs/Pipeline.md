# Mission Control Task Pipeline

> Draft 1 – canonical end-to-end workflow for **every** task.

## High-Level Stages

Every task must pass through these stages, in order, with no skips:

1. **planning**
2. **inbox** ("ready for orchestration")
3. **in_progress** (implementation by specialists)
4. **testing** (UAT / integration / E2E / edge cases)
5. **review** (gap, code, build, security, quality)
6. **git** (commit + PR)
7. **done**

All status changes must be:
- Initiated by **Jarvis** (orchestration logic), not arbitrary agents.
- Backed by **Activities** (who did what, decisions, questions) and
  **Deliverables** (code links, migrations, test results, PRs, etc.).

## Roles (Conceptual Agents)

These are logical roles; they may map to concrete OpenClaw agents:

- **Pepper (COO / Discovery)** – creates new tasks in `inbox`.
- **Planner** – runs structured planning and defines the spec.
- **Frontend Worker** – implements UI/JS.
- **Backend Worker** – implements APIs / services.
- **DBA** – schema + migrations.
- **UAT Specialist** – user-level testing.
- **Integration Tester** – cross-service flows.
- **E2E Tester** – full-stack flows.
- **Edge/Persona Tester** – edge cases, different user personas.
- **Gap Analyst** – checks acceptance criteria & completeness.
- **Code Reviewer** – lint, style, security, quality.
- **Build Specialist** – build/CI health.
- **Git Specialist** – commits + PRs.
- **Jarvis** – orchestrator and final authority on transitions.

## Evidence Model

For every stage, Jarvis enforces:

- **Activities** must contain at least one entry from the required role(s)
  describing what was done and any decisions/outcomes.
- **Deliverables** must contain the expected artifacts for that stage
  (spec, code links, test results, PR, etc.).
- **Checks** (where applicable) must be recorded as pass/fail, with
  failure pushing the task back to `in_progress`.

No silent success: a task cannot advance without written evidence.

## Stage Definitions & Transitions

### 1. planning

**Entry:**
- New task created (typically by Pepper) in `planning` or `inbox`.

**Required roles:**
- Planner (could be Jarvis or a dedicated planning agent).

**Required evidence:**
- Activity from Planner summarizing:
  - Clarified scope & goals.
  - Constraints and assumptions.
  - Proposed approach.
- Deliverable:
  - Planning spec / execution plan attached (or stored and linked).

**Allowed transitions:**
- `planning → inbox`

**Guard:**
- Disallow leaving `planning` until planning spec + planner activity exist.

---

### 2. inbox (ready for orchestration)

**Entry:**
- Task moved from `planning` after planning is complete, OR
- Task created directly as `inbox` by Pepper or a human (Jarvis may
  decide to route it back through `planning` if insufficient detail).

**Required roles:**
- Jarvis (orchestrator).

**Jarvis responsibilities:**
- Decide whether planning is sufficient.
- Decide which implementation roles are required (FE, BE, DBA, etc.).
- Prepare assignment notes in Activities.

**Allowed transitions:**
- `inbox → planning` (if spec insufficient).
- `inbox → in_progress` (once ready and assigned).

**Guard:**
- `inbox → in_progress` requires:
  - At least one Activity by Jarvis describing who is being asked to do
    what (assignments and expectations).

---

### 3. in_progress (implementation)

**Entry:**
- Task moved from `inbox` by Jarvis when ready and assigned.

**Typical roles involved:**
- Frontend Worker, Backend Worker, DBA, others (as needed).

**Required evidence to eventually leave `in_progress`:**
- For each assigned specialist role:
  - Activity entry describing what they implemented, where, and any
    open questions.
  - Deliverables entry linking to relevant code changes (branch, commit,
    MR/PR draft, file paths, diagrams, etc.).
- Jarvis Activity summarising that all required implementation work is
  reported as done and appears complete.

**Allowed transitions:**
- `in_progress → testing` (only Jarvis).
- `in_progress → planning` (if scope is unclear; Jarvis only).

**Guard:**
- `in_progress → testing` requires:
  - For each required implementation role, at least one Activity entry;
  - Relevant Deliverables (code/branch/PR link) present;
  - Jarvis Activity confirming implementation is ready for testing.

---

### 4. testing

**Entry:**
- Task moved from `in_progress` by Jarvis when implementation is ready.

**Roles involved:**
- UAT Specialist
- Integration Tester
- E2E Tester
- Edge/Persona Tester (optional but encouraged)

**Required evidence to leave `testing`:**
- Activities from each required tester role reporting:
  - What they tested.
  - Results (pass/fail).
  - Any notable issues or caveats.
- Deliverables:
  - Links to test reports / screenshots / recordings as relevant.
- A structured notion of test checks:
  - UAT: pass/fail
  - Integration: pass/fail
  - E2E: pass/fail
  - Edge/Persona: pass/fail

**Allowed transitions:**
- `testing → in_progress` (tests failing; Jarvis).
- `testing → review` (all required tests green; Jarvis).

**Guard:**
- `testing → review` requires:
  - All configured test checks are marked pass;
  - Tester Activities + Deliverables present;
  - Jarvis Activity acknowledging that all tests are green and evidence
    is attached.

---

### 5. review

**Entry:**
- Task moved from `testing` by Jarvis after all tests pass.

**Roles involved:**
- Gap Analyst – validates acceptance criteria and completeness.
- Code Reviewer – code quality, security, lint.
- Build Specialist – build/CI health.

**Required evidence to leave `review`:**
- Activities:
  - Gap Analyst: confirms acceptance criteria & planning spec are met
    (or lists gaps if not).
  - Code Reviewer: confirms quality/security + lint status.
  - Build Specialist: confirms builds pass (local and/or CI).
- Deliverables:
  - Links to lint results / CI runs / build logs as appropriate.
- Checks:
  - gap: pass/fail
  - security/quality (code review): pass/fail
  - build: pass/fail

**Allowed transitions:**
- `review → in_progress` (any check fails; Jarvis).
- `review → git` (all checks pass; Jarvis).

**Guard:**
- `review → git` requires all review checks be pass and supporting
  Activities + Deliverables be present.

---

### 6. git (commit & PR)

**Entry:**
- Task moved from `review` by Jarvis after all review checks pass.

**Role involved:**
- Git Specialist.

**Expected actions:**
- Commit changes to the appropriate branch.
- Push branch to remote.
- Open PR/MR to the canonical repo/branch.

**Required evidence:**
- Activity from Git Specialist including:
  - Branch name.
  - Commit hash(es).
  - PR/MR URL.
- Deliverables:
  - PR link, branch name, and any release/merge notes.

**Allowed transitions:**
- `git → in_progress` (if Git work fails and needs fixes; Jarvis).
- `git → done` (once PR is created and in the desired state; Jarvis).

**Guard:**
- `git → done` requires:
  - Git Specialist Activity with commit/PR details;
  - Deliverables updated with PR link & relevant metadata.

---

### 7. done

**Entry:**
- Task moved from `git` by Jarvis after commit/PR has been created.

**Meaning:**
- All stages are complete; evidence is logged; work is ready for
  deployment or has been merged according to your release process.

**No forward transitions.**
If further work is needed, a new task should be created (often by
Pepper) rather than re-opening `done` tasks.

---

## Enforcement Strategy

1. **Backend guards (API layer)**
   - Implement status transition validation in the Mission Control API.
   - Reject transitions that don’t meet the per-stage evidence rules
     defined above.

2. **Jarvis as the only automatic mover**
   - Ensure that cron jobs and automated transitions are always
     initiated via Jarvis’ orchestration logic, not direct DB updates.
   - Human operators may still move tasks manually, but the API guards
     will enforce evidence requirements.

3. **Cron-driven orchestration**
   - Lightweight cron jobs periodically:
     - Scan tasks by status.
     - Ask Jarvis to:
       - Assign specialists (inbox → in_progress).
       - Check whether all required Activities/Deliverables/checks are
         present.
       - Move tasks forward or backward as needed.

4. **No silent paths**
   - Every agent doing work on a task must:
     - Log an Activity entry summarizing what they did.
     - Attach or update Deliverables when they produce artifacts.
   - Jarvis will not allow a task to advance without this evidence.

---

## Future Extensions

- Task types or templates that tweak which roles/checks are mandatory
  (while preserving the overall pipeline structure).
- Per-workspace configuration to enable/disable certain reviewers or
  testers (still going through the same stages).
- Deeper integration with CI systems to auto-populate build/test
  Deliverables.
