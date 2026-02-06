# Postmortem: Mission Control Node.js Version Mismatch Incident

**Date:** 2026-02-06  
**Severity:** High (Service Outage)  
**Duration:** ~15 minutes (18:16-18:35 UTC)  
**Status:** Resolved  
**Author:** Jarvis (Mission Control Orchestrator)

---

## Executive Summary

Mission Control experienced a complete service outage due to a native module (better-sqlite3) compiled for Node.js v22 while the systemd service ran Node.js v24. All database-backed APIs failed, blocking the orchestration pipeline. The issue was resolved by clearing node-gyp cache and rebuilding the native module with correct headers.

---

## Timeline (UTC)

| Time | Event |
|------|-------|
| 18:16 | Heartbeat detected Mission Control service down (restart loop) |
| 18:21 | Identified missing `.next` production build |
| 18:22 | Ran `npm run build` to recreate production build |
| 18:23 | Build completed, service restarted but immediately failed |
| 18:23 | Discovered `ERR_DLOPEN_FAILED` errors in logs |
| 18:23 | Identified root cause: better-sqlite3 compiled for Node v22.22.0, service using v24.13.0 |
| 18:24-18:28 | Multiple rebuild attempts failed due to node-gyp cache using wrong headers |
| 18:28 | Identified node-gyp was using cached v22 headers despite running with v24 npm |
| 18:29 | Cleared `~/.cache/node-gyp/22.22.0` directory |
| 18:29-18:31 | Removed build directory, triggered clean rebuild with v24 headers |
| 18:31 | Compilation completed successfully (`gyp info ok`) |
| 18:35 | Force-killed stuck process, restarted service |
| 18:35 | Service restored, all 11 agents online, APIs operational |
| 18:36 | Postmortem task created, heartbeat checks resumed |

---

## Root Cause Analysis

### Primary Root Cause
**Native module (better-sqlite3) compiled against Node.js v22.22.0 while production service configured to run Node.js v24.13.0.**

### 5 Whys Analysis

**Why did Mission Control fail to start?**  
→ Because better-sqlite3.node couldn't load (ERR_DLOPEN_FAILED)

**Why couldn't the module load?**  
→ Because it was compiled for Node MODULE_VERSION 127 (v22) but v24 requires MODULE_VERSION 137

**Why was it compiled for the wrong version?**  
→ Because `npm rebuild` ran with the current shell's Node version (v22.22.0), not the service's version (v24.13.0)

**Why was the shell using a different Node version than the service?**  
→ Because systemd service explicitly specifies `/home/ejernigan/.nvm/versions/node/v24.13.0/bin/node` while the shell's `$PATH` had v22 first

**Why didn't we detect this mismatch during deployment?**  
→ Because there was no pre-deployment check verifying native module compatibility with the target Node version

### Contributing Factors

1. **No version alignment enforcement**: Development environment used v22, production used v24, no validation between them
2. **Node-gyp cache pollution**: Cache persisted v22 headers even after switching to v24 npm binary
3. **Missing pre-flight checks**: No automated verification that native modules match the target runtime
4. **Systemd service configuration not documented**: The Node version override in the service file wasn't clearly documented in setup/deployment docs
5. **Silent version drift**: NVM allows multiple Node versions without warning about mismatches

---

## Impact Assessment

### Systems Affected
- ✅ Mission Control web server (Next.js) - continued serving static pages
- ❌ All database operations (agents, tasks, activities, events) - complete failure
- ❌ Orchestration pipeline visibility - no task status queries possible
- ❌ Session monitoring - OpenClaw session sync broke
- ❌ Heartbeat checks - unable to query task state
- ❌ Real-time event stream (SSE) - failed to query events table

### User Impact
- **Internal team only** (no external users affected)
- Orchestrator (Jarvis) unable to monitor pipeline for ~15 minutes
- Background agents potentially spawned but unable to report status
- No task visibility during outage window

### Data Impact
- ✅ No data loss (database file intact)
- ✅ No corruption (SQLite remained consistent)
- ⚠️ Potential activity log gaps if sessions completed during outage

---

## What Went Well

1. **Fast detection**: Heartbeat detected issue within seconds
2. **Clear error messages**: `ERR_DLOPEN_FAILED` immediately pointed to native module issue
3. **Logs accessible**: Systemd journal provided full error stack traces
4. **Quick pivot**: After initial rebuild attempts failed, correctly identified cache issue
5. **Clean resolution**: Native rebuild from source with correct headers worked immediately
6. **No data loss**: Database integrity maintained throughout

---

## What Went Wrong

1. **Version mismatch undetected**: No validation that build environment matched deployment environment
2. **Multiple failed rebuild attempts**: Wasted ~5 minutes before identifying cache issue
3. **Incomplete documentation**: Systemd service Node version override not documented in deployment guides
4. **No rollback path**: No quick way to revert to last known-good state
5. **Manual recovery required**: No automated detection or self-healing for this failure mode

---

## Preventive Measures

### Immediate (This Week)

1. **Document Node version requirements** ✅
   - Add to `README.md` and `DEPLOYMENT.md`
   - Specify exact Node version required: v24.13.0
   - Document systemd service configuration

2. **Add pre-build validation script**
   ```bash
   # scripts/validate-environment.sh
   #!/bin/bash
   REQUIRED_NODE_VERSION="24.13.0"
   CURRENT_NODE_VERSION=$(node --version | cut -d'v' -f2)
   if [ "$CURRENT_NODE_VERSION" != "$REQUIRED_NODE_VERSION" ]; then
     echo "ERROR: Node version mismatch"
     echo "Required: v$REQUIRED_NODE_VERSION"
     echo "Current: v$CURRENT_NODE_VERSION"
     exit 1
   fi
   ```

3. **Update systemd service with explicit PATH**
   ```ini
   [Service]
   Environment=PATH=/home/ejernigan/.nvm/versions/node/v24.13.0/bin:/usr/bin:/bin
   Environment=NODE_VERSION=24.13.0
   ExecStartPre=/home/ejernigan/.nvm/versions/node/v24.13.0/bin/node --version
   ExecStart=/home/ejernigan/.nvm/versions/node/v24.13.0/bin/node node_modules/.bin/next start -H 0.0.0.0 -p 3001
   ```

### Short-term (This Month)

4. **Add health check endpoint with version info**
   ```typescript
   // /api/health/detailed
   {
     "status": "healthy",
     "nodeVersion": process.version,
     "nativeModules": {
       "better-sqlite3": {
         "version": "...",
         "nodeModuleVersion": process.versions.modules
       }
     }
   }
   ```

5. **Create deployment checklist**
   - [ ] Node version matches production requirement
   - [ ] Native modules rebuilt with correct version
   - [ ] `npm run build` succeeds
   - [ ] Health check endpoint returns 200
   - [ ] Database connection test passes
   - [ ] Systemd service starts cleanly

6. **Add pre-deployment smoke test**
   ```bash
   # scripts/pre-deploy-test.sh
   npm run build
   node -e "require('better-sqlite3')(':memory:'); console.log('✅ Native modules OK')"
   curl -f http://localhost:3001/api/health || exit 1
   ```

### Long-term (Next Quarter)

7. **Container-based deployment**
   - Use Docker to lock Node version across all environments
   - Eliminates version drift between dev/staging/prod
   - Native modules automatically built during image creation

8. **CI/CD pipeline with version validation**
   - GitHub Actions workflow validates Node version
   - Builds with target Node version, not developer's version
   - Automated smoke tests before allowing merge

9. **Self-healing monitoring**
   - Mission Control monitors its own health endpoint
   - Auto-restarts service on repeated failures
   - Alerts to Telegram on crash loop detection
   - Attempts automated recovery (rebuild + restart)

10. **Version drift alerts**
    - Weekly cron job compares dev/prod Node versions
    - Alerts if discrepancies detected
    - Proactive notification before issues occur

---

## Action Items

| Priority | Action | Owner | Deadline | Status |
|----------|--------|-------|----------|--------|
| P0 | Document Node v24.13.0 requirement in README | Jarvis | 2026-02-06 | ✅ |
| P0 | Create recovery runbook for native module issues | Jarvis | 2026-02-06 | ✅ |
| P1 | Implement pre-build validation script | Backend Worker | 2026-02-07 | Pending |
| P1 | Update systemd service with version validation | Jarvis | 2026-02-07 | Pending |
| P1 | Add detailed health check endpoint | Backend Worker | 2026-02-08 | Pending |
| P2 | Create deployment checklist | Jarvis | 2026-02-09 | Pending |
| P2 | Write deployment guide with version requirements | Jarvis | 2026-02-09 | Pending |
| P3 | Evaluate Docker-based deployment | Architect | 2026-02-20 | Pending |
| P3 | Design self-healing monitoring system | Architect | 2026-02-28 | Pending |

---

## Recovery Runbook

**For future incidents with native module version mismatch:**

```bash
# 1. Identify the issue
journalctl --user -u mission-control -n 50 | grep ERR_DLOPEN

# 2. Check Node versions
node --version  # Current shell
systemctl --user show mission-control -p Environment | grep PATH

# 3. Force clean rebuild with target Node version
cd ~/source/mission-control
rm -rf node_modules/better-sqlite3/build
rm -rf ~/.cache/node-gyp/$(node --version | cut -d'v' -f2 | cut -d'.' -f1,2)*
/path/to/target/node $(npm bin)/node-gyp rebuild --directory=node_modules/better-sqlite3

# 4. Verify module loads
/path/to/target/node -e "require('better-sqlite3')(':memory:'); console.log('OK')"

# 5. Restart service
systemctl --user restart mission-control

# 6. Verify health
curl http://localhost:3001/api/agents | jq 'length'
```

---

## Lessons Learned

### Technical
1. **Native modules are fragile**: Any Node version change requires rebuild
2. **Cache matters**: node-gyp cache can persist wrong headers across versions
3. **Explicit is better than implicit**: Systemd PATH overrides weren't obvious
4. **Version validation must be automated**: Manual checks are too error-prone

### Process
1. **PDCA methodology worked**: Careful validation prevented worse failures
2. **Logs are essential**: Systemd journal enabled fast diagnosis
3. **Documentation gaps are dangerous**: Undocumented service config caused confusion
4. **Postmortems create institutional memory**: This document prevents recurrence

### Operational
1. **Pre-flight checks are critical**: Would have caught this before deployment
2. **Health checks need depth**: Simple "is it running" isn't enough
3. **Self-healing is valuable**: Automated recovery could have saved 10+ minutes
4. **Version pinning is necessary**: Flexibility (NVM) creates risk without validation

---

## Follow-up Questions

1. **Why was the service using v24 when dev used v22?**  
   → Service was explicitly configured for v24 in systemd unit file, but this wasn't documented or enforced in development.

2. **Should we standardize on one Node version?**  
   → **Yes.** Recommend v24.13.0 everywhere. Update `.nvmrc` and document in all setup guides.

3. **How do we prevent this class of issue in future?**  
   → Container-based deployment (Docker) with locked versions + CI/CD validation.

4. **What about other native modules (e.g., sharp, canvas)?**  
   → Audit all dependencies for native modules. Add to validation script.

5. **Should we add version monitoring?**  
   → **Yes.** Weekly cron job to compare dev/prod versions and alert on drift.

---

## Conclusion

This incident was high-impact but short-lived, caused by a version mismatch between development and production environments. The root cause was lack of validation that native modules were compiled for the target runtime version. Resolution was straightforward once diagnosed, but took longer than necessary due to node-gyp cache issues.

**Key Takeaway:** Native module dependencies require explicit version alignment and validation between build and runtime environments. This must be automated, not manual.

**Status:** Resolved with no data loss. Preventive measures designed. Action items tracked.

---

**Sign-off:**  
Jarvis (Mission Control Orchestrator)  
2026-02-06 18:42 UTC
