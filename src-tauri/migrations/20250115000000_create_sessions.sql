-- Migration: Create sessions table
-- Created: 2025-01-15
-- Description: Sessions are Claude Code working sessions within a project

CREATE TABLE sessions (
    -- Primary Key
    id TEXT PRIMARY KEY NOT NULL,

    -- Foreign Key to Projects
    project_id TEXT NOT NULL,                -- References projects(id)

    -- Session Metadata
    name TEXT NOT NULL,

    -- Repository Information
    session_repo_path TEXT,                  -- Isolated copy at /tmp/opslane-sessions/{id}/repo
    base_branch TEXT NOT NULL DEFAULT 'main',

    -- Container Information
    container_id TEXT,
    container_name TEXT,
    container_branch TEXT,

    -- Status & State
    status TEXT NOT NULL DEFAULT 'created'
        CHECK(status IN ('created', 'cloning', 'ready', 'error')),
    error_message TEXT,

    -- Session Persistence
    volume_name TEXT,
    claude_session_id TEXT,
    last_activity_at TEXT,

    -- Initial User Message
    initial_message TEXT,

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Soft Delete
    is_deleted BOOLEAN NOT NULL DEFAULT 0,

    -- Foreign Key Constraint with Cascade Delete and Update
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Index for querying sessions by project
CREATE INDEX idx_sessions_project ON sessions(project_id) WHERE is_deleted = 0;

-- Index for filtering by status
CREATE INDEX idx_sessions_status ON sessions(status) WHERE is_deleted = 0;

-- Index for finding idle sessions
CREATE INDEX idx_sessions_activity ON sessions(last_activity_at) WHERE is_deleted = 0;

-- Trigger to auto-update updated_at timestamp
CREATE TRIGGER sessions_updated_at
AFTER UPDATE ON sessions
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE sessions SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Trigger to update project's last_opened_at when session is created
CREATE TRIGGER sessions_update_project_activity
AFTER INSERT ON sessions
FOR EACH ROW
BEGIN
    UPDATE projects
    SET last_opened_at = datetime('now')
    WHERE id = NEW.project_id;
END;
