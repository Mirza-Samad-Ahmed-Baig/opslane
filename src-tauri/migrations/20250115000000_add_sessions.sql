-- Create sessions table for storing Claude Code session metadata
CREATE TABLE sessions (
    -- Primary Key
    id TEXT PRIMARY KEY NOT NULL,

    -- Session Metadata
    name TEXT NOT NULL,

    -- Repository Information
    local_repo_path TEXT NOT NULL,
    base_branch TEXT NOT NULL DEFAULT 'main',

    -- Container Information
    container_id TEXT,
    container_name TEXT,
    container_branch TEXT,

    -- Status & State
    status TEXT NOT NULL DEFAULT 'created'
        CHECK(status IN ('created', 'cloning', 'ready', 'error')),
    error_message TEXT,

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Soft Delete
    is_deleted BOOLEAN NOT NULL DEFAULT 0
);

-- Index for filtering active sessions
CREATE INDEX idx_sessions_status ON sessions(status) WHERE is_deleted = 0;

-- Trigger: Update updated_at on any change
CREATE TRIGGER sessions_updated_at
AFTER UPDATE ON sessions
FOR EACH ROW
BEGIN
    UPDATE sessions SET updated_at = datetime('now') WHERE id = NEW.id;
END;
