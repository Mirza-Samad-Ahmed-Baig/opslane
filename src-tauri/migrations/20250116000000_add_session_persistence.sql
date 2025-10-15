-- Add session persistence fields to existing sessions table
ALTER TABLE sessions ADD COLUMN volume_name TEXT;

ALTER TABLE sessions ADD COLUMN claude_session_id TEXT;

ALTER TABLE sessions ADD COLUMN last_activity_at TEXT;

-- Index for finding idle sessions (future use)
CREATE INDEX idx_sessions_activity ON sessions(last_activity_at) WHERE status = 'ready' AND container_id IS NOT NULL;

-- Trigger: Update last_activity_at on status changes
CREATE TRIGGER sessions_activity_update
AFTER UPDATE OF status ON sessions
FOR EACH ROW
WHEN NEW.status = 'ready'
BEGIN
    UPDATE sessions SET last_activity_at = datetime('now') WHERE id = NEW.id;
END;
