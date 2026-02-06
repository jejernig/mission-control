# Mission Control Recovery Runbook

Quick reference for common failure modes and recovery procedures.

---

## Native Module Version Mismatch (ERR_DLOPEN_FAILED)

**Symptoms:**
- Service fails to start or crashes immediately
- Logs show: `Error: Module did not self-register`
- Logs show: `ERR_DLOPEN_FAILED`
- Logs mention: `NODE_MODULE_VERSION` mismatch

**Diagnosis:**
```bash
# Check service logs
journalctl --user -u mission-control -n 50 | grep ERR_DLOPEN

# Check Node versions
node --version  # Current shell version
systemctl --user show mission-control -p Environment | grep PATH
```

**Recovery Steps:**
```bash
# 1. Stop the service
systemctl --user stop mission-control

# 2. Navigate to project
cd ~/source/mission-control

# 3. Clear node-gyp cache (prevents stale headers)
rm -rf ~/.cache/node-gyp/*

# 4. Remove problematic build
rm -rf node_modules/better-sqlite3/build

# 5. Rebuild with correct Node version (v24.13.0)
/home/ejernigan/.nvm/versions/node/v24.13.0/bin/npm rebuild better-sqlite3

# 6. Verify the module loads
/home/ejernigan/.nvm/versions/node/v24.13.0/bin/node -e "require('better-sqlite3')(':memory:'); console.log('✅ Native module OK')"

# 7. Restart service
systemctl --user start mission-control

# 8. Wait 5 seconds and verify health
sleep 5
curl -s http://localhost:3001/api/agents | jq 'length'
```

**Expected Result:**
- Service starts cleanly
- API returns agent count (should be 11)
- Logs show: `[Plugins] Successfully loaded X/Y plugin(s)`

**If Still Failing:**
```bash
# Nuclear option: complete rebuild
cd ~/source/mission-control
rm -rf node_modules .next
/home/ejernigan/.nvm/versions/node/v24.13.0/bin/npm install
/home/ejernigan/.nvm/versions/node/v24.13.0/bin/npm run build
systemctl --user restart mission-control
```

---

## Missing Production Build

**Symptoms:**
- Service crashes with: `Could not find a production build in the '.next' directory`
- Logs show: `production-start-no-build-id`

**Recovery Steps:**
```bash
cd ~/source/mission-control
/home/ejernigan/.nvm/versions/node/v24.13.0/bin/npm run build
systemctl --user restart mission-control
```

---

## Service Won't Stop (Stuck in "deactivating")

**Symptoms:**
- `systemctl --user status mission-control` shows "deactivating (stop-sigterm)"
- Service persists for 30+ seconds after stop command

**Recovery Steps:**
```bash
# Find the PID
PID=$(systemctl --user show mission-control -p MainPID --value)

# Force kill
kill -9 $PID

# Verify it's gone
ps aux | grep next-server | grep 3001

# Clean restart
systemctl --user stop mission-control
sleep 2
systemctl --user start mission-control
```

---

## Database Locked

**Symptoms:**
- APIs return errors about database being locked
- Logs show: `SQLITE_BUSY` or `database is locked`

**Recovery Steps:**
```bash
# Stop service
systemctl --user stop mission-control

# Check for lingering processes
ps aux | grep "next-server" | grep 3001

# Kill any stragglers
pkill -9 -f "next-server.*3001"

# Verify database isn't corrupted
sqlite3 ~/source/mission-control/mission-control.db "PRAGMA integrity_check;"

# Should output: ok

# Restart
systemctl --user start mission-control
```

---

## OpenClaw Gateway Connection Failed

**Symptoms:**
- Mission Control starts but can't connect to OpenClaw
- Logs show: `Failed to connect to OpenClaw Gateway`
- Session spawning fails

**Recovery Steps:**
```bash
# Check OpenClaw Gateway status
openclaw status

# If not running:
openclaw gateway start

# Check connectivity
curl -s http://localhost:18789/health

# Check token in Mission Control .env
grep OPENCLAW_GATEWAY_TOKEN ~/source/mission-control/.env

# Should match token in OpenClaw config:
openclaw gateway config.get | jq '.auth.token'
```

---

## Port Already in Use

**Symptoms:**
- Service fails to start: `EADDRINUSE: address already in use :::3001`

**Recovery Steps:**
```bash
# Find process using port 3001
lsof -i :3001

# Kill it
kill -9 <PID>

# Or kill all node processes (nuclear)
killall -9 node

# Restart
systemctl --user start mission-control
```

---

## Complete System Reset

**Use this when nothing else works:**

```bash
# 1. Stop everything
systemctl --user stop mission-control
killall -9 node

# 2. Clean slate
cd ~/source/mission-control
rm -rf node_modules .next ~/.cache/node-gyp

# 3. Fresh install with correct Node version
/home/ejernigan/.nvm/versions/node/v24.13.0/bin/npm install

# 4. Build
/home/ejernigan/.nvm/versions/node/v24.13.0/bin/npm run build

# 5. Verify native modules
/home/ejernigan/.nvm/versions/node/v24.13.0/bin/node -e "require('better-sqlite3')(':memory:'); console.log('OK')"

# 6. Start service
systemctl --user start mission-control

# 7. Verify health
sleep 5
curl http://localhost:3001/api/agents | jq '.[].name'
```

---

## Health Check Commands

```bash
# Service status
systemctl --user status mission-control

# Recent logs
journalctl --user -u mission-control -n 50 --no-pager

# Live logs
journalctl --user -u mission-control -f

# API health check
curl http://localhost:3001/api/agents | jq 'length'

# Database check
sqlite3 ~/source/mission-control/mission-control.db "SELECT COUNT(*) FROM agents;"

# OpenClaw connectivity
curl http://localhost:18789/health
```

---

## Preventive Maintenance

**Weekly:**
```bash
# Check Node version matches requirement
cd ~/source/mission-control
node --version  # Should be v24.13.0

# Verify service health
systemctl --user status mission-control

# Check disk space
df -h ~/source/mission-control
```

**Monthly:**
```bash
# Clear old logs (if journal gets large)
journalctl --user -u mission-control --vacuum-time=30d

# Backup database
cp ~/source/mission-control/mission-control.db \
   ~/source/mission-control/mission-control.db.backup-$(date +%Y%m%d)
```

---

## Escalation

If none of these procedures resolve the issue:

1. Check recent commits: `git log -5 --oneline`
2. Review postmortems: `~/source/mission-control/docs/POSTMORTEM_*.md`
3. Create new postmortem task in Mission Control
4. Alert in Telegram with incident details

---

**Last Updated:** 2026-02-06  
**Maintained By:** Jarvis (Mission Control Orchestrator)
