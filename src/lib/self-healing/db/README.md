# Self-Healing Pipeline Database

SQLite database schema for the self-healing pipeline system. This database tracks issues, patterns, fixes, and system health metrics.

## Schema Overview

### Core Tables

#### `issues`
Tracks all detected issues in the system.

**Key Fields:**
- `id` (TEXT, PK): Unique issue identifier (UUID)
- `title` (TEXT): Short description
- `severity` (TEXT): critical, high, medium, low, info
- `status` (TEXT): detected, analyzing, fixing, fixed, failed, ignored
- `source` (TEXT): Component/service where issue originated
- `error_type` (TEXT): Classification (timeout, connection, memory, etc.)
- `metadata` (JSON): Additional context
- `detected_at`, `updated_at`, `resolved_at` (INTEGER): Unix timestamps
- `pattern_id`, `fix_id` (TEXT): References to matched pattern and applied fix

**Indexes:** status, severity, source, detected_at, pattern_id

#### `patterns`
Stores learned patterns for issue recognition.

**Key Fields:**
- `id` (TEXT, PK): Unique pattern identifier (UUID)
- `name` (TEXT, UNIQUE): Pattern name
- `pattern_type` (TEXT): regex, signature, ml_model, heuristic
- `pattern_data` (JSON): Pattern definition
- `confidence_threshold` (REAL): Minimum confidence to match (0-1)
- `match_count` (INTEGER): Times pattern has matched
- `success_rate` (REAL): Percentage of successful fixes
- `is_active` (INTEGER): 0/1 boolean

**Indexes:** pattern_type, is_active, severity

#### `fixes`
Stores fix strategies and configurations.

**Key Fields:**
- `id` (TEXT, PK): Unique fix identifier (UUID)
- `name` (TEXT): Fix name
- `fix_type` (TEXT): restart, config_change, script, rollback, scale, manual, custom
- `action_data` (JSON): Fix execution details
- `prerequisites` (JSON): Conditions required before applying
- `rollback_data` (JSON): Rollback instructions
- `risk_level` (TEXT): critical, high, medium, low
- `max_retries` (INTEGER): Maximum retry attempts
- `requires_approval` (INTEGER): 0/1 boolean
- `pattern_id` (TEXT): Associated pattern (optional)

**Indexes:** fix_type, pattern_id, is_active

#### `fix_executions`
Tracks individual fix execution attempts.

**Key Fields:**
- `id` (TEXT, PK): Unique execution identifier (UUID)
- `issue_id`, `fix_id` (TEXT): Foreign keys
- `status` (TEXT): pending, running, success, failed, rolled_back, cancelled
- `attempt_number` (INTEGER): Retry attempt
- `duration_ms` (INTEGER): Execution time
- `output` (TEXT): Execution logs
- `started_at`, `completed_at` (INTEGER): Timestamps

**Indexes:** issue_id, fix_id, status, started_at

#### `metrics`
Stores performance and health metrics.

**Key Fields:**
- `id` (TEXT, PK): Unique metric identifier (UUID)
- `metric_type` (TEXT): Type of metric
- `metric_name` (TEXT): Metric name
- `metric_value` (REAL): Numeric value
- `unit` (TEXT): Unit of measurement
- `source` (TEXT): Origin of metric
- `tags` (JSON): Categorization
- `timestamp` (INTEGER): When metric was recorded

**Indexes:** metric_type, metric_name, timestamp, source

#### `system_health`
System health snapshots over time.

**Key Fields:**
- `id` (TEXT, PK): Unique snapshot identifier (UUID)
- `health_score` (REAL): Overall health (0-100)
- `status` (TEXT): healthy, degraded, critical, unknown
- `active_issues` (INTEGER): Current open issues
- `resolved_issues_24h` (INTEGER): Issues resolved in last 24h
- `failed_fixes_24h` (INTEGER): Failed fixes in last 24h
- `average_resolution_time_ms` (INTEGER): Avg resolution time
- `details` (JSON): Detailed breakdown

**Indexes:** timestamp, status

#### `schema_migrations`
Tracks applied database migrations.

**Key Fields:**
- `version` (TEXT, PK): Migration version
- `name` (TEXT): Migration name
- `applied_at` (INTEGER): When applied
- `checksum` (TEXT): Migration checksum

## Usage

### Initialize Database

```bash
# Using Python script
python3 db/init.py init

# Or import in code
from db.init import DatabaseManager

db = DatabaseManager("self_healing.db")
db.init_database()
```

### Verify Schema

```bash
python3 db/init.py verify
```

### Check Version

```bash
python3 db/init.py version
```

## Running Tests

```bash
cd tests
python3 test_database.py
```

The test suite includes:
- Schema initialization tests
- Table structure verification
- Constraint validation
- Index verification
- CRUD operations
- Foreign key relationships
- JSON field handling

## Migration System

Migrations are stored in `db/migrations/` with the naming convention:
```
XXX_description.sql
```

Where `XXX` is a zero-padded version number (e.g., `001`, `002`).

Each migration is tracked in the `schema_migrations` table with a checksum to prevent duplicate application.

## Design Principles

1. **UUID Primary Keys**: All tables use TEXT UUIDs for globally unique identifiers
2. **Unix Timestamps**: All timestamps stored as INTEGER (seconds since epoch)
3. **JSON for Flexibility**: Metadata, tags, and complex data stored as JSON
4. **CHECK Constraints**: Enforce valid enum values at database level
5. **Foreign Keys**: Enabled and used for referential integrity
6. **Indexes**: Strategic indexes on frequently queried columns
7. **Soft Deletes**: Important records use status flags instead of deletion

## Example Queries

### Get active issues by severity
```sql
SELECT id, title, severity, detected_at 
FROM issues 
WHERE status NOT IN ('fixed', 'ignored')
ORDER BY 
  CASE severity 
    WHEN 'critical' THEN 1 
    WHEN 'high' THEN 2 
    WHEN 'medium' THEN 3 
    WHEN 'low' THEN 4 
    ELSE 5 
  END,
  detected_at DESC;
```

### Get pattern success rates
```sql
SELECT name, match_count, success_rate,
       ROUND(match_count * success_rate / 100.0) as successful_matches
FROM patterns
WHERE is_active = 1
ORDER BY success_rate DESC;
```

### Get recent system health trend
```sql
SELECT datetime(timestamp, 'unixepoch') as time,
       health_score, status, active_issues
FROM system_health
ORDER BY timestamp DESC
LIMIT 20;
```

### Get fix execution statistics
```sql
SELECT f.name, f.fix_type,
       COUNT(fe.id) as executions,
       SUM(CASE WHEN fe.status = 'success' THEN 1 ELSE 0 END) as successes,
       ROUND(AVG(fe.duration_ms)) as avg_duration_ms
FROM fixes f
LEFT JOIN fix_executions fe ON f.id = fe.fix_id
GROUP BY f.id
ORDER BY executions DESC;
```

## Security Considerations

1. **No Sensitive Data**: Don't store passwords, API keys, or PII
2. **Access Control**: Implement application-level access controls
3. **Backup**: Regular backups recommended for production
4. **WAL Mode**: Consider enabling WAL mode for concurrent access
5. **Encryption**: Use SQLCipher or filesystem encryption for sensitive deployments

## Performance Tips

1. **Vacuum Regularly**: Run `VACUUM` periodically to reclaim space
2. **Analyze Statistics**: Run `ANALYZE` after bulk operations
3. **Batch Inserts**: Use transactions for multiple inserts
4. **Index Maintenance**: Monitor query performance and add indexes as needed
5. **Archive Old Data**: Move historical data to separate tables/databases

## Schema Version

Current Version: **001** (Initial Schema)

Last Updated: 2026-02-05
