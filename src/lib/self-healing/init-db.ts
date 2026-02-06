/**
 * Initialize Self-Healing Database
 * 
 * Creates the self-healing database and schema if it doesn't exist
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export function initializeSelfHealingDb(dbPath: string): void {
  console.log(`[DB] Initializing self-healing database at: ${dbPath}`);

  // Create database if it doesn't exist
  const db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Read schema file
  const schemaPath = path.join(__dirname, 'db', 'schema.sql');
  
  if (!fs.existsSync(schemaPath)) {
    console.error(`[DB] Schema file not found at: ${schemaPath}`);
    throw new Error('Schema file not found');
  }

  const schema = fs.readFileSync(schemaPath, 'utf-8');

  // Execute schema
  try {
    db.exec(schema);
    console.log('[DB] Schema initialized successfully');
  } catch (error) {
    console.error('[DB] Failed to initialize schema:', error);
    throw error;
  }

  // Verify tables exist
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    ORDER BY name
  `).all() as { name: string }[];

  console.log('[DB] Created tables:', tables.map(t => t.name).join(', '));

  db.close();
  console.log('[DB] Initialization complete');
}

// Run if called directly
if (require.main === module) {
  const dbPath = process.env.SELF_HEALING_DB_PATH || path.join(process.cwd(), 'self-healing.db');
  initializeSelfHealingDb(dbPath);
}
