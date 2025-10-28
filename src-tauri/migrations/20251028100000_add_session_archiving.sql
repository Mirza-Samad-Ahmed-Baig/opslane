-- Add is_archived column to sessions table
ALTER TABLE sessions ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT 0;

-- Add archived_at timestamp for tracking when archived
ALTER TABLE sessions ADD COLUMN archived_at TEXT;

-- Add index for efficient filtering of archived sessions
CREATE INDEX idx_sessions_archived ON sessions(is_archived)
    WHERE is_deleted = 0;
