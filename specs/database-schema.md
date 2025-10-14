# Database Schema Design

## Overview

This document defines the complete database schema for Opslane, including table structures, relationships, indexes, constraints, and migration strategies. The database uses SQLite for local storage with plans for future PostgreSQL support for cloud/team features.

---

## Table of Contents

1. [Schema Overview](#schema-overview)
2. [Table Definitions](#table-definitions)
3. [Relationships](#relationships)
4. [Indexes](#indexes)
5. [Constraints & Validation](#constraints--validation)
6. [Migrations](#migrations)
7. [Data Access Patterns](#data-access-patterns)
8. [Performance Optimization](#performance-optimization)
9. [Security](#security)
10. [Backup & Recovery](#backup--recovery)

---

## Schema Overview

### Technology Stack

- **Database:** SQLite 3.40+
- **ORM/Query Builder:** SQLx (Rust)
- **Migrations:** SQLx migrations
- **Encryption:** SQLCipher for sensitive data

### Database File Location

```
macOS:    ~/Library/Application Support/com.opslane.app/opslane.db
Windows:  %APPDATA%/com.opslane.app/opslane.db
Linux:    ~/.local/share/opslane/opslane.db
```

### Design Principles

1. **Normalization:** 3NF (Third Normal Form) for consistency
2. **Performance:** Denormalize where read-heavy (message counts, file counts)
3. **Referential Integrity:** Foreign keys with cascading deletes
4. **Audit Trail:** Track created_at, updated_at for all entities
5. **Soft Deletes:** Option for sessions (keep for history)
6. **JSON Storage:** Use JSON columns for flexible metadata

---

## Table Definitions

### 1. sessions

Stores Claude Code session metadata.

```sql
CREATE TABLE sessions (
    -- Primary Key
    id TEXT PRIMARY KEY NOT NULL,  -- UUID v4 (e.g., "550e8400-e29b-41d4-a716-446655440000")

    -- Session Metadata
    name TEXT NOT NULL,             -- User-provided name (e.g., "Add dark mode")
    description TEXT,               -- Optional longer description

    -- Repository Information
    local_repo_path TEXT NOT NULL, -- Absolute path to local repo
    base_branch TEXT NOT NULL DEFAULT 'main', -- Starting branch

    -- Container Information
    container_id TEXT,              -- Docker container ID
    container_name TEXT,            -- Docker container name
    container_branch TEXT,          -- Git branch in container (e.g., "session/feat-abc123")
    working_dir TEXT NOT NULL DEFAULT '/workspace/repo', -- Working directory in container

    -- Status & State
    status TEXT NOT NULL DEFAULT 'created' CHECK(status IN (
        'created',      -- Container being created
        'cloning',      -- Git repo being cloned
        'installing',   -- Dependencies being installed (future)
        'ready',        -- Ready for chat
        'running',      -- Claude actively working
        'idle',         -- No activity for >5 minutes
        'synced',       -- Changes synced to local
        'completed',    -- Applied and committed
        'error',        -- Error state
        'archived'      -- Soft deleted
    )),
    error_message TEXT,             -- Error details if status = 'error'

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_activity_at TEXT,          -- Last message or tool use
    completed_at TEXT,              -- When marked completed
    archived_at TEXT,               -- When archived

    -- Statistics (Denormalized for Performance)
    message_count INTEGER NOT NULL DEFAULT 0,
    user_message_count INTEGER NOT NULL DEFAULT 0,
    assistant_message_count INTEGER NOT NULL DEFAULT 0,
    tool_use_count INTEGER NOT NULL DEFAULT 0,
    files_changed INTEGER NOT NULL DEFAULT 0,
    lines_added INTEGER NOT NULL DEFAULT 0,
    lines_deleted INTEGER NOT NULL DEFAULT 0,

    -- Resource Tracking
    cpu_limit REAL DEFAULT 1.0,     -- CPU cores allocated
    memory_limit_mb INTEGER DEFAULT 2048, -- Memory in MB

    -- Metadata (JSON)
    metadata TEXT,                  -- JSON: { "tags": [], "notes": "", "template_id": "" }

    -- Soft Delete
    is_deleted BOOLEAN NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX idx_sessions_status ON sessions(status) WHERE is_deleted = 0;
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity_at DESC) WHERE is_deleted = 0;
CREATE INDEX idx_sessions_repo_path ON sessions(local_repo_path) WHERE is_deleted = 0;
CREATE INDEX idx_sessions_archived ON sessions(archived_at) WHERE is_deleted = 1;

-- Trigger: Update updated_at on any change
CREATE TRIGGER sessions_updated_at
AFTER UPDATE ON sessions
FOR EACH ROW
BEGIN
    UPDATE sessions SET updated_at = datetime('now') WHERE id = NEW.id;
END;
```

**Example Row:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Add dark mode toggle",
  "description": "Implement dark mode with localStorage persistence",
  "local_repo_path": "/Users/me/projects/my-app",
  "base_branch": "main",
  "container_id": "abc123def456",
  "container_name": "opslane-session-550e8400",
  "container_branch": "session/feat-20251014-550e8400",
  "working_dir": "/workspace/repo",
  "status": "ready",
  "error_message": null,
  "created_at": "2025-01-14 10:30:00",
  "updated_at": "2025-01-14 10:32:15",
  "last_activity_at": "2025-01-14 10:32:15",
  "completed_at": null,
  "archived_at": null,
  "message_count": 4,
  "user_message_count": 2,
  "assistant_message_count": 2,
  "tool_use_count": 5,
  "files_changed": 4,
  "lines_added": 45,
  "lines_deleted": 8,
  "cpu_limit": 1.0,
  "memory_limit_mb": 2048,
  "metadata": "{\"tags\": [\"ui\", \"frontend\"], \"notes\": \"\"}",
  "is_deleted": 0
}
```

---

### 2. messages

Stores chat messages and tool interactions.

```sql
CREATE TABLE messages (
    -- Primary Key
    id TEXT PRIMARY KEY NOT NULL,  -- UUID v4

    -- Foreign Keys
    session_id TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,

    -- Message Data
    message_type TEXT NOT NULL CHECK(message_type IN (
        'user',         -- User message
        'assistant',    -- Claude's response
        'tool_use',     -- Claude using a tool
        'tool_result',  -- Tool execution result
        'system',       -- System message (e.g., "Session created")
        'error'         -- Error message
    )),

    -- Content (JSON)
    content TEXT NOT NULL,          -- JSON content blocks (Anthropic format)

    -- Message Metadata
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    model TEXT,                     -- Model used (e.g., "claude-sonnet-4-5")
    stop_reason TEXT,               -- Why Claude stopped (e.g., "end_turn", "max_tokens")

    -- Tool Information (if message_type = 'tool_use')
    tool_name TEXT,                 -- Name of tool (e.g., "Write", "Edit")
    tool_input TEXT,                -- JSON tool parameters
    tool_output TEXT,               -- Tool execution result

    -- Tokens & Cost (for analytics)
    input_tokens INTEGER,
    output_tokens INTEGER,

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Sequence
    sequence_number INTEGER NOT NULL, -- Order within session (1, 2, 3, ...)

    -- Metadata
    metadata TEXT                   -- JSON: { "images": [], "thinking_time_ms": 0 }
);

-- Indexes
CREATE INDEX idx_messages_session_id ON messages(session_id, sequence_number);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_type ON messages(message_type);
CREATE INDEX idx_messages_tool_name ON messages(tool_name) WHERE tool_name IS NOT NULL;

-- Trigger: Increment message count on session
CREATE TRIGGER messages_increment_count
AFTER INSERT ON messages
FOR EACH ROW
BEGIN
    UPDATE sessions
    SET
        message_count = message_count + 1,
        user_message_count = user_message_count + CASE WHEN NEW.role = 'user' THEN 1 ELSE 0 END,
        assistant_message_count = assistant_message_count + CASE WHEN NEW.role = 'assistant' THEN 1 ELSE 0 END,
        tool_use_count = tool_use_count + CASE WHEN NEW.message_type = 'tool_use' THEN 1 ELSE 0 END,
        last_activity_at = datetime('now')
    WHERE id = NEW.session_id;
END;
```

**Example Row (User Message):**
```json
{
  "id": "msg-001",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "message_type": "user",
  "content": "{\"type\": \"text\", \"text\": \"Add a dark mode toggle to the header\"}",
  "role": "user",
  "model": null,
  "stop_reason": null,
  "tool_name": null,
  "tool_input": null,
  "tool_output": null,
  "input_tokens": null,
  "output_tokens": null,
  "created_at": "2025-01-14 10:30:05",
  "sequence_number": 1,
  "metadata": "{}"
}
```

**Example Row (Tool Use):**
```json
{
  "id": "msg-002",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "message_type": "tool_use",
  "content": "{\"type\": \"tool_use\", \"name\": \"Write\", \"input\": {...}}",
  "role": "assistant",
  "model": "claude-sonnet-4-5",
  "stop_reason": "tool_use",
  "tool_name": "Write",
  "tool_input": "{\"file_path\": \"src/components/DarkModeToggle.tsx\", \"content\": \"...\"}",
  "tool_output": "{\"success\": true, \"message\": \"File created\"}",
  "input_tokens": 150,
  "output_tokens": 200,
  "created_at": "2025-01-14 10:30:10",
  "sequence_number": 2,
  "metadata": "{}"
}
```

---

### 3. sync_state

Tracks which session is currently synced to local repository. Only one row exists.

```sql
CREATE TABLE sync_state (
    -- Singleton pattern: only one row
    id INTEGER PRIMARY KEY CHECK (id = 1),

    -- Foreign Keys
    synced_session_id TEXT,
    FOREIGN KEY (synced_session_id) REFERENCES sessions(id) ON DELETE SET NULL,

    -- Sync Information
    stash_id TEXT,                  -- Git stash ID if local changes were stashed
    patch_hash TEXT,                -- SHA256 of applied patch (for verification)

    -- Timestamps
    synced_at TEXT,                 -- When synced

    -- Metadata
    original_head TEXT,             -- Original HEAD commit before sync
    files_synced INTEGER DEFAULT 0, -- Number of files synced
    metadata TEXT                   -- JSON: { "conflicts": [], "warnings": [] }
);

-- Ensure only one row
INSERT INTO sync_state (id) VALUES (1);
```

**Example Row (Session Synced):**
```json
{
  "id": 1,
  "synced_session_id": "550e8400-e29b-41d4-a716-446655440000",
  "stash_id": "stash@{0}",
  "patch_hash": "a3b2c1d4e5f6...",
  "synced_at": "2025-01-14 10:35:00",
  "original_head": "abc123def456",
  "files_synced": 4,
  "metadata": "{}"
}
```

**Example Row (No Session Synced):**
```json
{
  "id": 1,
  "synced_session_id": null,
  "stash_id": null,
  "patch_hash": null,
  "synced_at": null,
  "original_head": null,
  "files_synced": 0,
  "metadata": "{}"
}
```

---

### 4. credentials

Stores encrypted API keys and tokens.

```sql
CREATE TABLE credentials (
    -- Primary Key
    id TEXT PRIMARY KEY NOT NULL,  -- UUID v4

    -- Credential Type
    credential_type TEXT NOT NULL UNIQUE CHECK(credential_type IN (
        'anthropic_api_key',
        'github_token',
        'github_app_installation', -- Future
        'custom_api_key'           -- Future: custom model APIs
    )),

    -- Encrypted Value
    encrypted_value TEXT NOT NULL, -- AES-256 encrypted
    encryption_version INTEGER NOT NULL DEFAULT 1, -- For key rotation

    -- Metadata
    last_verified_at TEXT,         -- Last successful API call
    is_valid BOOLEAN DEFAULT 1,    -- Set to 0 if validation fails
    error_message TEXT,            -- Last validation error

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Trigger: Update updated_at
CREATE TRIGGER credentials_updated_at
AFTER UPDATE ON credentials
FOR EACH ROW
BEGIN
    UPDATE credentials SET updated_at = datetime('now') WHERE id = NEW.id;
END;
```

**Example Row:**
```json
{
  "id": "cred-001",
  "credential_type": "anthropic_api_key",
  "encrypted_value": "U2FsdGVkX1...[encrypted]",
  "encryption_version": 1,
  "last_verified_at": "2025-01-14 10:00:00",
  "is_valid": 1,
  "error_message": null,
  "created_at": "2025-01-14 09:00:00",
  "updated_at": "2025-01-14 10:00:00"
}
```

---

### 5. settings

Stores application settings as key-value pairs.

```sql
CREATE TABLE settings (
    -- Primary Key
    key TEXT PRIMARY KEY NOT NULL,

    -- Value (JSON for complex types)
    value TEXT NOT NULL,
    value_type TEXT NOT NULL CHECK(value_type IN (
        'string',
        'number',
        'boolean',
        'json'
    )),

    -- Metadata
    description TEXT,              -- What this setting does
    is_user_configurable BOOLEAN NOT NULL DEFAULT 1,

    -- Timestamps
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Trigger: Update updated_at
CREATE TRIGGER settings_updated_at
AFTER UPDATE ON settings
FOR EACH ROW
BEGIN
    UPDATE settings SET updated_at = datetime('now') WHERE key = NEW.key;
END;

-- Default Settings
INSERT INTO settings (key, value, value_type, description) VALUES
    ('default_repo_path', '~/', 'string', 'Default repository path'),
    ('default_base_branch', 'main', 'string', 'Default base branch'),
    ('docker_cpu_limit', '1.0', 'number', 'CPU cores per container'),
    ('docker_memory_limit_mb', '2048', 'number', 'Memory MB per container'),
    ('max_concurrent_sessions', '5', 'number', 'Max active sessions'),
    ('auto_sync_on_ready', 'false', 'boolean', 'Auto-sync when Claude finishes'),
    ('theme', 'system', 'string', 'UI theme: light, dark, system'),
    ('enable_analytics', 'true', 'boolean', 'Send anonymous usage data'),
    ('container_pool_size', '3', 'number', 'Pre-warmed containers'),
    ('message_retention_days', '90', 'number', 'Delete messages older than N days'),
    ('enable_notifications', 'true', 'boolean', 'Desktop notifications'),
    ('notification_sounds', 'false', 'boolean', 'Play sounds'),
    ('editor_command', 'code', 'string', 'Command to open editor'),
    ('diff_view_mode', 'side-by-side', 'string', 'Diff viewer mode'),
    ('auto_stash_local_changes', 'true', 'boolean', 'Auto-stash on sync');
```

---

### 6. file_changes

Tracks individual file changes per session for quick lookup.

```sql
CREATE TABLE file_changes (
    -- Primary Key
    id TEXT PRIMARY KEY NOT NULL,  -- UUID v4

    -- Foreign Keys
    session_id TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,

    -- File Information
    file_path TEXT NOT NULL,       -- Relative to repo root (e.g., "src/App.tsx")
    change_type TEXT NOT NULL CHECK(change_type IN (
        'added',
        'modified',
        'deleted',
        'renamed'
    )),

    -- Change Statistics
    lines_added INTEGER NOT NULL DEFAULT 0,
    lines_deleted INTEGER NOT NULL DEFAULT 0,

    -- Rename Information
    old_path TEXT,                 -- For renames

    -- Diff Content (Optional - can be regenerated)
    diff_content TEXT,             -- Unified diff for this file

    -- Timestamps
    first_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_changed_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Metadata
    message_id TEXT,               -- Which message caused this change
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_file_changes_session ON file_changes(session_id);
CREATE INDEX idx_file_changes_path ON file_changes(session_id, file_path);
CREATE INDEX idx_file_changes_type ON file_changes(change_type);

-- Trigger: Update session file stats
CREATE TRIGGER file_changes_update_session_stats
AFTER INSERT ON file_changes
FOR EACH ROW
BEGIN
    UPDATE sessions
    SET
        files_changed = (SELECT COUNT(DISTINCT file_path) FROM file_changes WHERE session_id = NEW.session_id),
        lines_added = (SELECT COALESCE(SUM(lines_added), 0) FROM file_changes WHERE session_id = NEW.session_id),
        lines_deleted = (SELECT COALESCE(SUM(lines_deleted), 0) FROM file_changes WHERE session_id = NEW.session_id)
    WHERE id = NEW.session_id;
END;
```

**Example Row:**
```json
{
  "id": "fc-001",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "file_path": "src/components/DarkModeToggle.tsx",
  "change_type": "added",
  "lines_added": 35,
  "lines_deleted": 0,
  "old_path": null,
  "diff_content": "--- /dev/null\n+++ b/src/components/DarkModeToggle.tsx\n@@ ...",
  "first_changed_at": "2025-01-14 10:30:10",
  "last_changed_at": "2025-01-14 10:30:10",
  "message_id": "msg-002"
}
```

---

### 7. session_tags (Future)

Many-to-many relationship for session categorization.

```sql
CREATE TABLE tags (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    color TEXT,                    -- Hex color (e.g., "#3B82F6")
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE session_tags (
    session_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (session_id, tag_id),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_session_tags_session ON session_tags(session_id);
CREATE INDEX idx_session_tags_tag ON session_tags(tag_id);
```

---

### 8. session_templates (Future)

Pre-configured session templates.

```sql
CREATE TABLE session_templates (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,                     -- Emoji or icon identifier

    -- Template Configuration
    initial_prompt TEXT NOT NULL,  -- First message to Claude
    suggested_model TEXT,

    -- Settings
    settings TEXT,                 -- JSON: { "cpu_limit": 1.0, ... }

    -- Metadata
    usage_count INTEGER DEFAULT 0,
    is_builtin BOOLEAN DEFAULT 0,  -- System templates vs user-created

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Built-in templates
INSERT INTO session_templates (id, name, description, icon, initial_prompt, is_builtin) VALUES
    ('tpl-bug-fix', 'Bug Fix', 'Investigate and fix a bug', '🐛',
     'I have a bug in my code. Let me describe it:', 1),
    ('tpl-feature', 'New Feature', 'Build a new feature', '✨',
     'I want to add a new feature:', 1),
    ('tpl-refactor', 'Refactoring', 'Improve code structure', '♻️',
     'I want to refactor the following code:', 1),
    ('tpl-test', 'Add Tests', 'Write tests for existing code', '🧪',
     'I need to add tests for:', 1);
```

---

### 9. analytics_events (Optional)

Anonymous usage analytics for product improvement.

```sql
CREATE TABLE analytics_events (
    id TEXT PRIMARY KEY NOT NULL,

    -- Event Data
    event_type TEXT NOT NULL,      -- e.g., "session_created", "sync_completed"
    event_data TEXT,               -- JSON event payload

    -- Context
    session_id TEXT,               -- Optional: related session

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_created ON analytics_events(created_at DESC);
```

---

## Relationships

### Entity Relationship Diagram

```
┌─────────────┐
│  sessions   │
└──────┬──────┘
       │ 1
       │
       │ N
┌──────┴──────────┐
│    messages     │
└──────┬──────────┘
       │
       │ 1
       │
       │ N
┌──────┴──────────┐
│  file_changes   │
└─────────────────┘

┌─────────────┐       ┌─────────────┐
│  sessions   │ 1   1 │ sync_state  │
└─────────────┘───────└─────────────┘

┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│  sessions   │ N   N │session_tags │ N   N │    tags     │
└─────────────┘───────└─────────────┘───────└─────────────┘

┌─────────────────┐
│  credentials    │ (standalone)
└─────────────────┘

┌─────────────────┐
│    settings     │ (standalone)
└─────────────────┘

┌──────────────────┐
│session_templates│ (standalone)
└──────────────────┘
```

---

## Indexes

### Query Optimization Strategy

**High-Traffic Queries:**

1. **Dashboard: List Active Sessions**
   ```sql
   SELECT * FROM sessions
   WHERE is_deleted = 0 AND status != 'archived'
   ORDER BY last_activity_at DESC
   LIMIT 20;
   ```
   **Index:** `idx_sessions_last_activity`

2. **Chat: Load Messages**
   ```sql
   SELECT * FROM messages
   WHERE session_id = ?
   ORDER BY sequence_number ASC;
   ```
   **Index:** `idx_messages_session_id`

3. **Sync: Get Current State**
   ```sql
   SELECT * FROM sync_state WHERE id = 1;
   ```
   **No index needed:** Single row

4. **Files: List Changed Files**
   ```sql
   SELECT * FROM file_changes
   WHERE session_id = ?
   ORDER BY file_path ASC;
   ```
   **Index:** `idx_file_changes_session`

### Composite Indexes

```sql
-- Fast session filtering + sorting
CREATE INDEX idx_sessions_status_activity
ON sessions(status, last_activity_at DESC)
WHERE is_deleted = 0;

-- Fast message pagination
CREATE INDEX idx_messages_session_sequence
ON messages(session_id, sequence_number);

-- Fast tool usage lookup
CREATE INDEX idx_messages_session_tool
ON messages(session_id, tool_name)
WHERE message_type = 'tool_use';
```

---

## Constraints & Validation

### Application-Level Validation

```rust
// Session validation
impl Session {
    pub fn validate(&self) -> Result<(), ValidationError> {
        if self.name.trim().is_empty() {
            return Err(ValidationError::EmptyName);
        }
        if self.name.len() > 100 {
            return Err(ValidationError::NameTooLong);
        }
        if !Path::new(&self.local_repo_path).exists() {
            return Err(ValidationError::InvalidRepoPath);
        }
        // Check status transitions
        if !self.is_valid_status_transition(self.status) {
            return Err(ValidationError::InvalidStatusTransition);
        }
        Ok(())
    }
}
```

### Database-Level Constraints

```sql
-- Enforce single synced session
CREATE TRIGGER enforce_single_sync
BEFORE UPDATE ON sync_state
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'Cannot have multiple rows in sync_state')
    WHERE NEW.id != 1;
END;

-- Prevent deleting synced session
CREATE TRIGGER prevent_delete_synced_session
BEFORE DELETE ON sessions
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'Cannot delete currently synced session')
    WHERE OLD.id = (SELECT synced_session_id FROM sync_state WHERE id = 1);
END;

-- Ensure message sequence is monotonic
CREATE TRIGGER validate_message_sequence
BEFORE INSERT ON messages
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'Invalid message sequence number')
    WHERE NEW.sequence_number != (
        SELECT COALESCE(MAX(sequence_number), 0) + 1
        FROM messages
        WHERE session_id = NEW.session_id
    );
END;
```

---

## Migrations

### Migration Strategy

**Tool:** SQLx migrations
**Location:** `src-tauri/migrations/`
**Naming:** `YYYYMMDDHHMMSS_description.sql`

### Initial Migration: `20250114000000_initial_schema.sql`

```sql
-- Create all tables in order (respecting foreign keys)

-- 1. sessions (no dependencies)
CREATE TABLE sessions (...);
CREATE INDEX idx_sessions_status ON sessions(status);
-- ... all indexes and triggers

-- 2. messages (depends on sessions)
CREATE TABLE messages (...);
CREATE INDEX idx_messages_session_id ON messages(session_id, sequence_number);
-- ... triggers

-- 3. sync_state (depends on sessions)
CREATE TABLE sync_state (...);
INSERT INTO sync_state (id) VALUES (1);

-- 4. credentials (standalone)
CREATE TABLE credentials (...);

-- 5. settings (standalone)
CREATE TABLE settings (...);
INSERT INTO settings (...) VALUES (...); -- defaults

-- 6. file_changes (depends on sessions, messages)
CREATE TABLE file_changes (...);
CREATE INDEX idx_file_changes_session ON file_changes(session_id);
-- ... triggers
```

### Example Migration: `20250115000000_add_session_templates.sql`

```sql
-- Up Migration
CREATE TABLE session_templates (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    initial_prompt TEXT NOT NULL,
    suggested_model TEXT,
    settings TEXT,
    usage_count INTEGER DEFAULT 0,
    is_builtin BOOLEAN DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO session_templates (id, name, description, icon, initial_prompt, is_builtin) VALUES
    ('tpl-bug-fix', 'Bug Fix', 'Investigate and fix a bug', '🐛',
     'I have a bug in my code. Let me describe it:', 1);
```

### Example Migration: `20250116000000_add_tags.sql`

```sql
CREATE TABLE tags (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE session_tags (
    session_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (session_id, tag_id),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_session_tags_session ON session_tags(session_id);
CREATE INDEX idx_session_tags_tag ON session_tags(tag_id);
```

### Migration Runner (Rust)

```rust
use sqlx::sqlite::SqlitePool;
use sqlx::migrate::MigrateDatabase;

pub async fn run_migrations(database_url: &str) -> Result<(), sqlx::Error> {
    // Create database if not exists
    if !sqlx::Sqlite::database_exists(database_url).await? {
        sqlx::Sqlite::create_database(database_url).await?;
    }

    // Connect
    let pool = SqlitePool::connect(database_url).await?;

    // Run migrations
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await?;

    Ok(())
}
```

---

## Data Access Patterns

### Pattern 1: Create Session

```rust
use sqlx::SqlitePool;
use uuid::Uuid;

pub async fn create_session(
    pool: &SqlitePool,
    name: String,
    repo_path: String,
    base_branch: String,
) -> Result<Session, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    let container_branch = format!("session/feat-{}", &id[..8]);

    sqlx::query_as!(
        Session,
        r#"
        INSERT INTO sessions (
            id, name, local_repo_path, base_branch,
            container_branch, status
        ) VALUES (?, ?, ?, ?, ?, 'created')
        RETURNING *
        "#,
        id, name, repo_path, base_branch, container_branch
    )
    .fetch_one(pool)
    .await
}
```

### Pattern 2: List Active Sessions

```rust
pub async fn list_active_sessions(
    pool: &SqlitePool,
    limit: i64,
    offset: i64,
) -> Result<Vec<Session>, sqlx::Error> {
    sqlx::query_as!(
        Session,
        r#"
        SELECT * FROM sessions
        WHERE is_deleted = 0 AND status != 'archived'
        ORDER BY last_activity_at DESC
        LIMIT ? OFFSET ?
        "#,
        limit, offset
    )
    .fetch_all(pool)
    .await
}
```

### Pattern 3: Add Message

```rust
pub async fn add_message(
    pool: &SqlitePool,
    session_id: &str,
    role: &str,
    content: &str,
    message_type: &str,
) -> Result<Message, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    // Get next sequence number
    let next_seq: i64 = sqlx::query_scalar!(
        "SELECT COALESCE(MAX(sequence_number), 0) + 1 FROM messages WHERE session_id = ?",
        session_id
    )
    .fetch_one(pool)
    .await?;

    sqlx::query_as!(
        Message,
        r#"
        INSERT INTO messages (
            id, session_id, message_type, content,
            role, sequence_number
        ) VALUES (?, ?, ?, ?, ?, ?)
        RETURNING *
        "#,
        id, session_id, message_type, content, role, next_seq
    )
    .fetch_one(pool)
    .await
}
```

### Pattern 4: Set Sync State

```rust
pub async fn set_sync_state(
    pool: &SqlitePool,
    session_id: Option<&str>,
    stash_id: Option<&str>,
) -> Result<(), sqlx::Error> {
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query!(
        r#"
        UPDATE sync_state
        SET
            synced_session_id = ?,
            stash_id = ?,
            synced_at = ?
        WHERE id = 1
        "#,
        session_id, stash_id, now
    )
    .execute(pool)
    .await?;

    // Update session status
    if let Some(sid) = session_id {
        sqlx::query!(
            "UPDATE sessions SET status = 'synced' WHERE id = ?",
            sid
        )
        .execute(pool)
        .await?;
    }

    Ok(())
}
```

### Pattern 5: Get Session with Messages

```rust
pub async fn get_session_with_messages(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<SessionWithMessages, sqlx::Error> {
    let session = sqlx::query_as!(
        Session,
        "SELECT * FROM sessions WHERE id = ?",
        session_id
    )
    .fetch_one(pool)
    .await?;

    let messages = sqlx::query_as!(
        Message,
        r#"
        SELECT * FROM messages
        WHERE session_id = ?
        ORDER BY sequence_number ASC
        "#,
        session_id
    )
    .fetch_all(pool)
    .await?;

    Ok(SessionWithMessages { session, messages })
}
```

---

## Performance Optimization

### 1. Connection Pooling

```rust
use sqlx::sqlite::SqlitePoolOptions;

pub async fn create_pool(database_url: &str) -> Result<SqlitePool, sqlx::Error> {
    SqlitePoolOptions::new()
        .max_connections(5)          // Max concurrent connections
        .connect(database_url)
        .await
}
```

### 2. Write-Ahead Logging (WAL)

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;  -- 64MB cache
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 30000000000;  -- 30GB mmap
```

### 3. Bulk Inserts

```rust
pub async fn bulk_insert_file_changes(
    pool: &SqlitePool,
    changes: Vec<FileChange>,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    for change in changes {
        sqlx::query!(
            r#"
            INSERT INTO file_changes (
                id, session_id, file_path, change_type,
                lines_added, lines_deleted
            ) VALUES (?, ?, ?, ?, ?, ?)
            "#,
            change.id, change.session_id, change.file_path,
            change.change_type, change.lines_added, change.lines_deleted
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}
```

### 4. Lazy Loading

```rust
// Don't load message content by default
pub async fn list_messages_summary(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<Vec<MessageSummary>, sqlx::Error> {
    sqlx::query_as!(
        MessageSummary,
        r#"
        SELECT
            id, message_type, role, tool_name,
            created_at, sequence_number
        FROM messages
        WHERE session_id = ?
        ORDER BY sequence_number ASC
        "#,
        session_id
    )
    .fetch_all(pool)
    .await
}

// Load full content on demand
pub async fn get_message_content(
    pool: &SqlitePool,
    message_id: &str,
) -> Result<String, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT content FROM messages WHERE id = ?",
        message_id
    )
    .fetch_one(pool)
    .await
}
```

### 5. Archival Strategy

```rust
// Archive old completed sessions (soft delete)
pub async fn archive_old_sessions(
    pool: &SqlitePool,
    days: i64,
) -> Result<u64, sqlx::Error> {
    let cutoff = chrono::Utc::now() - chrono::Duration::days(days);
    let cutoff_str = cutoff.to_rfc3339();

    let result = sqlx::query!(
        r#"
        UPDATE sessions
        SET
            is_deleted = 1,
            archived_at = datetime('now')
        WHERE
            status = 'completed'
            AND completed_at < ?
        "#,
        cutoff_str
    )
    .execute(pool)
    .await?;

    Ok(result.rows_affected())
}
```

---

## Security

### 1. Credential Encryption

```rust
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, NewAead};
use rand::Rng;

pub fn encrypt_credential(plaintext: &str, master_key: &[u8]) -> Result<String, Error> {
    let key = Key::from_slice(master_key);
    let cipher = Aes256Gcm::new(key);

    let nonce_bytes = rand::thread_rng().gen::<[u8; 12]>();
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|_| Error::EncryptionFailed)?;

    // Combine nonce + ciphertext
    let mut result = nonce_bytes.to_vec();
    result.extend_from_slice(&ciphertext);

    Ok(base64::encode(result))
}

pub fn decrypt_credential(encrypted: &str, master_key: &[u8]) -> Result<String, Error> {
    let key = Key::from_slice(master_key);
    let cipher = Aes256Gcm::new(key);

    let data = base64::decode(encrypted)?;
    let (nonce_bytes, ciphertext) = data.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| Error::DecryptionFailed)?;

    String::from_utf8(plaintext).map_err(|_| Error::InvalidUtf8)
}
```

### 2. Master Key Management

```rust
use keyring::Entry;

pub fn get_or_create_master_key() -> Result<Vec<u8>, Error> {
    let entry = Entry::new("com.opslane.app", "master_key")?;

    match entry.get_password() {
        Ok(key) => Ok(base64::decode(key)?),
        Err(_) => {
            // Generate new key
            let key: [u8; 32] = rand::thread_rng().gen();
            entry.set_password(&base64::encode(key))?;
            Ok(key.to_vec())
        }
    }
}
```

### 3. SQL Injection Prevention

**Always use parameterized queries (SQLx does this automatically):**

```rust
// ✅ SAFE: Parameterized
sqlx::query!("SELECT * FROM sessions WHERE name = ?", user_input)
    .fetch_all(pool)
    .await?;

// ❌ UNSAFE: String concatenation (don't do this)
// let query = format!("SELECT * FROM sessions WHERE name = '{}'", user_input);
```

---

## Backup & Recovery

### 1. Automatic Backups

```rust
use std::fs;
use std::path::Path;

pub async fn backup_database(db_path: &Path) -> Result<(), std::io::Error> {
    let backup_dir = db_path.parent().unwrap().join("backups");
    fs::create_dir_all(&backup_dir)?;

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let backup_path = backup_dir.join(format!("opslane_{}.db", timestamp));

    fs::copy(db_path, backup_path)?;

    // Keep only last 7 backups
    cleanup_old_backups(&backup_dir, 7)?;

    Ok(())
}

fn cleanup_old_backups(backup_dir: &Path, keep: usize) -> Result<(), std::io::Error> {
    let mut backups: Vec<_> = fs::read_dir(backup_dir)?
        .filter_map(Result::ok)
        .collect();

    backups.sort_by_key(|e| e.metadata().unwrap().modified().unwrap());
    backups.reverse();

    for backup in backups.iter().skip(keep) {
        fs::remove_file(backup.path())?;
    }

    Ok(())
}
```

### 2. Export/Import

```rust
// Export session to JSON
pub async fn export_session(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<serde_json::Value, Error> {
    let session = get_session_with_messages(pool, session_id).await?;
    let files = get_file_changes(pool, session_id).await?;

    Ok(json!({
        "version": "1.0",
        "session": session,
        "files": files,
        "exported_at": chrono::Utc::now().to_rfc3339()
    }))
}

// Import session from JSON
pub async fn import_session(
    pool: &SqlitePool,
    data: serde_json::Value,
) -> Result<String, Error> {
    // Validate version, insert session, messages, files
    // Return new session ID
}
```

---

## Testing

### Test Database Setup

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    async fn setup_test_db() -> SqlitePool {
        let pool = SqlitePool::connect(":memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn test_create_session() {
        let pool = setup_test_db().await;

        let session = create_session(
            &pool,
            "Test Session".to_string(),
            "/tmp/test".to_string(),
            "main".to_string(),
        )
        .await
        .unwrap();

        assert_eq!(session.name, "Test Session");
        assert_eq!(session.status, "created");
    }

    #[tokio::test]
    async fn test_sync_state_singleton() {
        let pool = setup_test_db().await;

        // Should have exactly one row
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sync_state")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(count, 1);
    }
}
```

---

## Appendix

### A. Data Size Estimates

**Per Session:**
- Session row: ~500 bytes
- Messages (avg 20): ~10 KB
- File changes (avg 5): ~2 KB
- **Total:** ~13 KB per session

**100 Sessions:** ~1.3 MB
**1000 Sessions:** ~13 MB

### B. Query Performance Benchmarks

Target performance on M1 MacBook:

| Query | Expected Time | Acceptable |
|-------|---------------|------------|
| List sessions (20) | <10ms | <50ms |
| Load messages (100) | <20ms | <100ms |
| Get file changes | <15ms | <75ms |
| Create session | <5ms | <25ms |
| Add message | <5ms | <25ms |

### C. Schema Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-14 | Initial schema |
| 1.1 | 2025-01-15 | Add session_templates |
| 1.2 | 2025-01-16 | Add tags system |

---

**Document Version:** 1.0
**Last Updated:** 2025-01-14
**Owner:** Engineering Team
**Stakeholders:** Backend, Product, QA
