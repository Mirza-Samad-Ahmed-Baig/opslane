-- Add session_repo_path to track where we copied the repo for this session
ALTER TABLE sessions ADD COLUMN session_repo_path TEXT;

-- For existing sessions, we can leave it NULL (they're using old behavior)
-- New sessions will always have this populated
