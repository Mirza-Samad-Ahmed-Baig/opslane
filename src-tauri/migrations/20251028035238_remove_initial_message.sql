-- Remove initial_message column from sessions table
-- This field was only used for optimistic UI display and is no longer needed
-- Initial messages are now sent through the standard send_message command
--
-- WARNING: This migration is irreversible. The initial_message data will be lost.
-- This is safe because:
-- 1. initial_message was only used for UI display (optimistic rendering)
-- 2. Actual messages are stored in Claude's session files, not the database
-- 3. Initial messages will now be sent through the unified send_message path
ALTER TABLE sessions DROP COLUMN initial_message;
