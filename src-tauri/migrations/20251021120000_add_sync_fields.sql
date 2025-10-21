-- Add sync tracking fields to sessions table
ALTER TABLE sessions ADD COLUMN last_sync_at TEXT;
ALTER TABLE sessions ADD COLUMN sync_status TEXT DEFAULT 'idle'
    CHECK(sync_status IN ('idle', 'syncing', 'synced', 'error'));

-- Index for filtering by sync status
CREATE INDEX idx_sessions_sync_status ON sessions(sync_status)
    WHERE is_deleted = 0;
