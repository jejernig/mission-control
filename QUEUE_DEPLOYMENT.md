# 🐰 Message Queue Pipeline - Deployment Guide

**Status:** ✅ All code written, ready to deploy  
**Created:** 2026-02-07 00:20 UTC  
**Architecture:** Fix 4 (Message Queue) from analysis

---

## 🚀 Quick Start (When You're Back)

```bash
cd ~/source/mission-control
./scripts/deploy-queue-architecture.sh
```

That's it! The script handles everything.

---

## 📋 What Was Built

### Core Components

1. **RabbitMQ Container** (`docker-compose.yml`)
   - Persistent message broker with management UI
   - Auto-restart, health checks included

2. **Queue Listener Service** (`src/services/queue-listener.ts`)
   - Consumes messages from 4 queues
   - Spawns OpenClaw agents via CLI
   - Auto-retry (3 attempts) + dead letter queue
   - 8,820 bytes of TypeScript

3. **Message Publishers** (4 systemd timers)
   - `pipeline-planning.timer` - Every 5 min
   - `pipeline-assign.timer` - Every 10 min
   - `pipeline-review.timer` - Every 15 min
   - `pipeline-architect.timer` - Every 20 min

4. **Publisher Script** (`scripts/publish-queue-message.sh`)
   - Used by timers to publish messages
   - Publishes via docker exec + rabbitmqadmin

5. **Deployment Script** (`scripts/deploy-queue-architecture.sh`)
   - One-command setup
   - Starts everything and verifies

---

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│    Systemd Timers (Staggered)       │
│  Planning (5m) | Assign (10m)       │
│  Review (15m)  | Architect (20m)    │
└──────────────┬──────────────────────┘
               │ Publish messages
               ↓
┌─────────────────────────────────────┐
│         RabbitMQ (Docker)           │
│  • pipeline.planning                │
│  • pipeline.assign                  │
│  • pipeline.review                  │
│  • pipeline.architect               │
│  • pipeline.dlq (dead letter)       │
└──────────────┬──────────────────────┘
               │ Pull messages
               ↓
┌─────────────────────────────────────┐
│    Queue Listener (Node Service)    │
│  • Spawns OpenClaw agents           │
│  • Retries on failure (3x)          │
│  • Reports back via sessions_send   │
└──────────────┬──────────────────────┘
               │ Spawn agents
               ↓
┌─────────────────────────────────────┐
│      OpenClaw Isolated Sessions     │
│  • Process tasks                    │
│  • Update Mission Control API       │
│  • Send status to Jarvis            │
└─────────────────────────────────────┘
```

---

## 📊 Message Flow Example

**Timer fires** → Publishes message to RabbitMQ:
```json
{
  "type": "process_planning",
  "timestamp": "2026-02-07T00:15:00Z",
  "batchSize": 20
}
```

**Queue Listener** receives message → Spawns agent:
```bash
openclaw sessions spawn \
  --agent jarvis \
  --label "Queue: process_planning" \
  --task "Move planning tasks to inbox..." \
  --cleanup delete \
  --timeout 300
```

**Agent completes** → Reports back:
```bash
sessions_send --label jarvis --message "🔄 Task Processor: Moved 5 tasks planning→inbox"
```

---

## 🔧 Manual Commands (If Needed)

### Start RabbitMQ
```bash
cd ~/source/mission-control
docker compose up -d rabbitmq
docker ps | grep mission-control-queue
```

### Start Queue Listener
```bash
systemctl --user daemon-reload
systemctl --user enable mission-control-queue-listener
systemctl --user start mission-control-queue-listener
systemctl --user status mission-control-queue-listener
```

### Start Timers
```bash
systemctl --user enable --now pipeline-planning.timer
systemctl --user enable --now pipeline-assign.timer
systemctl --user enable --now pipeline-review.timer
systemctl --user enable --now pipeline-architect.timer
```

### Verify Timers
```bash
systemctl --user list-timers pipeline-*
```

### View Logs
```bash
# Queue listener logs
journalctl --user -u mission-control-queue-listener -f

# Timer logs
journalctl --user -u pipeline-planning.service -f
journalctl --user -u pipeline-assign.service -f
journalctl --user -u pipeline-review.service -f
journalctl --user -u pipeline-architect.service -f
```

---

## 🎛️ RabbitMQ Management UI

**URL:** http://localhost:15672  
**Username:** mission-control  
**Password:** mFAxUw6adjNVUn1w/zPATzte1f2aGempx3CIXDmROlk=

**What you can see:**
- Queue depths (how many messages waiting)
- Message rates (messages/sec)
- Consumer status (is listener connected?)
- Dead letter queue contents (failed messages)

---

## 🐛 Troubleshooting

### RabbitMQ won't start
```bash
# Check docker logs
docker logs mission-control-queue

# Restart container
docker restart mission-control-queue
```

### Queue listener isn't consuming
```bash
# Check service status
systemctl --user status mission-control-queue-listener

# Restart service
systemctl --user restart mission-control-queue-listener

# View logs
journalctl --user -u mission-control-queue-listener -n 50
```

### Timers not firing
```bash
# List all timers
systemctl --user list-timers pipeline-*

# Check timer status
systemctl --user status pipeline-planning.timer

# Manually trigger a timer
systemctl --user start pipeline-planning.service
```

### Messages stuck in queue
- Check RabbitMQ UI (http://localhost:15672)
- Look for consumer connections
- Check queue listener logs for errors
- Verify OpenClaw is running: `openclaw status`

---

## ✅ Success Criteria

After deployment, you should see:

1. **RabbitMQ running:**
   ```bash
   $ docker ps | grep rabbitmq
   mission-control-queue   Up 5 minutes   ...
   ```

2. **Queue listener active:**
   ```bash
   $ systemctl --user status mission-control-queue-listener
   ● mission-control-queue-listener.service - Mission Control Queue Listener
        Active: active (running) since ...
   ```

3. **Timers scheduled:**
   ```bash
   $ systemctl --user list-timers pipeline-*
   NEXT                         LEFT       LAST  PASSED  UNIT
   Fri 2026-02-07 00:25:00 CST  4min left  n/a   n/a     pipeline-planning.timer
   ...
   ```

4. **Messages flowing:**
   - RabbitMQ UI shows message rates
   - Queue listener logs show "📨 Processing message"
   - Jarvis receives status updates from spawned agents

---

## 📝 Next Steps After Deployment

1. **Monitor for 1 hour**
   - Watch queue depths in RabbitMQ UI
   - Check listener logs for errors
   - Verify tasks are moving through pipeline

2. **Tune intervals if needed**
   - Edit timer files: `~/.config/systemd/user/pipeline-*.timer`
   - Reload: `systemctl --user daemon-reload`
   - Restart: `systemctl --user restart pipeline-*.timer`

3. **Adjust batch sizes**
   - Edit service files: `~/.config/systemd/user/pipeline-*.service`
   - Change the last argument (batch size)
   - Reload: `systemctl --user daemon-reload`

---

## 🎉 Why This Architecture Rocks

✅ **Guaranteed execution** - systemd timers fire reliably  
✅ **Message persistence** - Tasks won't be lost if MC crashes  
✅ **Decoupled** - Timers and MC restart independently  
✅ **Scalable** - Can add more consumers if needed  
✅ **Industry standard** - RabbitMQ is battle-tested  
✅ **No heartbeat dependency** - Runs completely independent  
✅ **Fast** - 5-minute pipeline cycles (was 15-30 min)  
✅ **Observable** - Management UI + journald logs  

---

## 📚 References

- **PDCA Document:** `~/.openclaw/workspace/agents/jarvis/memory/2026-02-07-pdca-message-queue-pipeline.md`
- **Analysis:** `~/.openclaw/workspace/agents/jarvis/memory/2026-02-06-automation-fixes-analysis.md`
- **RabbitMQ Docs:** https://www.rabbitmq.com/documentation.html
- **systemd Timers:** `man systemd.timer`

---

**Questions? Issues? Check the logs first, then ping Jarvis!** 🤖
