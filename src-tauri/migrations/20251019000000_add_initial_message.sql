-- Add initial_message field for optimistic UI display
-- Allows frontend to show user's message immediately before Claude responds
ALTER TABLE sessions ADD COLUMN initial_message TEXT;
