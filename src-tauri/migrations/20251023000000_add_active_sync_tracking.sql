-- Add active session tracking to projects table
-- Only one session can have two-way sync active at a time
ALTER TABLE projects ADD COLUMN active_sync_session_id TEXT;
ALTER TABLE projects ADD COLUMN active_sync_started_at TEXT;

-- Add sync tracking fields to sessions
ALTER TABLE sessions ADD COLUMN is_sync_active BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN sync_activated_at TEXT;
ALTER TABLE sessions ADD COLUMN sync_deactivated_at TEXT;

-- Index for fast active session lookup
CREATE INDEX idx_projects_active_sync ON projects(active_sync_session_id)
    WHERE active_sync_session_id IS NOT NULL AND is_deleted = 0;

-- Index for sync active sessions
CREATE INDEX idx_sessions_sync_active ON sessions(is_sync_active)
    WHERE is_sync_active = 1 AND is_deleted = 0;

-- Add constraint comment (SQLite doesn't support adding foreign key constraints to existing tables)
-- active_sync_session_id should reference a valid session.id (validated in application code)