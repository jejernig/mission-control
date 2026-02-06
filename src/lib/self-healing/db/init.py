#!/usr/bin/env python3
"""
Self-Healing Pipeline Database Initialization

This module provides database initialization and migration utilities
for the self-healing pipeline system.
"""

import sqlite3
import json
import os
from pathlib import Path
from typing import Optional, Dict, Any
import hashlib
from datetime import datetime


class DatabaseManager:
    """Manages database initialization and migrations."""
    
    def __init__(self, db_path: str = "self_healing.db"):
        """
        Initialize database manager.
        
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self.migrations_dir = Path(__file__).parent / "migrations"
        
    def connect(self) -> sqlite3.Connection:
        """Create and return a database connection."""
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA foreign_keys = ON")
        conn.row_factory = sqlite3.Row
        return conn
    
    def init_database(self) -> bool:
        """
        Initialize the database with the schema.
        
        Returns:
            True if successful, False otherwise
        """
        try:
            schema_path = Path(__file__).parent / "schema.sql"
            
            if not schema_path.exists():
                print(f"Error: Schema file not found at {schema_path}")
                return False
            
            with open(schema_path, 'r') as f:
                schema_sql = f.read()
            
            conn = self.connect()
            cursor = conn.cursor()
            
            # Execute schema
            cursor.executescript(schema_sql)
            conn.commit()
            
            print(f"✓ Database initialized successfully at {self.db_path}")
            
            # Verify tables were created
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            )
            tables = [row[0] for row in cursor.fetchall()]
            print(f"✓ Created tables: {', '.join(tables)}")
            
            conn.close()
            return True
            
        except Exception as e:
            print(f"Error initializing database: {e}")
            return False
    
    def run_migration(self, version: str) -> bool:
        """
        Run a specific migration.
        
        Args:
            version: Migration version (e.g., '001')
            
        Returns:
            True if successful, False otherwise
        """
        migration_file = self.migrations_dir / f"{version}_*.sql"
        migration_files = list(self.migrations_dir.glob(f"{version}_*.sql"))
        
        if not migration_files:
            print(f"Error: Migration {version} not found")
            return False
        
        migration_path = migration_files[0]
        
        try:
            with open(migration_path, 'r') as f:
                migration_sql = f.read()
            
            # Calculate checksum
            checksum = hashlib.sha256(migration_sql.encode()).hexdigest()
            
            conn = self.connect()
            cursor = conn.cursor()
            
            # Check if already applied
            cursor.execute(
                "SELECT version FROM schema_migrations WHERE version = ?",
                (version,)
            )
            if cursor.fetchone():
                print(f"Migration {version} already applied")
                conn.close()
                return True
            
            # Run migration
            cursor.executescript(migration_sql)
            conn.commit()
            
            print(f"✓ Applied migration {version}: {migration_path.stem}")
            conn.close()
            return True
            
        except Exception as e:
            print(f"Error running migration {version}: {e}")
            return False
    
    def get_schema_version(self) -> Optional[str]:
        """
        Get the current schema version.
        
        Returns:
            Version string or None if not initialized
        """
        try:
            conn = self.connect()
            cursor = conn.cursor()
            cursor.execute(
                "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1"
            )
            row = cursor.fetchone()
            conn.close()
            return row[0] if row else None
        except sqlite3.OperationalError:
            return None
    
    def verify_schema(self) -> Dict[str, Any]:
        """
        Verify the database schema integrity.
        
        Returns:
            Dictionary with verification results
        """
        results = {
            "valid": False,
            "tables": [],
            "indexes": [],
            "issues": []
        }
        
        expected_tables = [
            "issues",
            "patterns", 
            "fixes",
            "fix_executions",
            "metrics",
            "system_health",
            "schema_migrations"
        ]
        
        try:
            conn = self.connect()
            cursor = conn.cursor()
            
            # Check tables
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            )
            tables = [row[0] for row in cursor.fetchall()]
            results["tables"] = tables
            
            # Check for missing tables
            missing_tables = set(expected_tables) - set(tables)
            if missing_tables:
                results["issues"].append(f"Missing tables: {', '.join(missing_tables)}")
            
            # Check indexes
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='index' ORDER BY name"
            )
            indexes = [row[0] for row in cursor.fetchall() if row[0]]
            results["indexes"] = indexes
            
            # Check foreign keys are enabled
            cursor.execute("PRAGMA foreign_keys")
            fk_status = cursor.fetchone()[0]
            if fk_status != 1:
                results["issues"].append("Foreign keys are not enabled")
            
            results["valid"] = len(results["issues"]) == 0
            conn.close()
            
        except Exception as e:
            results["issues"].append(f"Verification error: {e}")
        
        return results


def main():
    """Main entry point for database initialization."""
    import sys
    
    db_manager = DatabaseManager()
    
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "init":
            success = db_manager.init_database()
            sys.exit(0 if success else 1)
        
        elif command == "verify":
            results = db_manager.verify_schema()
            print(json.dumps(results, indent=2))
            sys.exit(0 if results["valid"] else 1)
        
        elif command == "version":
            version = db_manager.get_schema_version()
            print(f"Schema version: {version or 'not initialized'}")
            sys.exit(0)
        
        else:
            print(f"Unknown command: {command}")
            print("Usage: init.py [init|verify|version]")
            sys.exit(1)
    else:
        # Default: initialize
        success = db_manager.init_database()
        sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
