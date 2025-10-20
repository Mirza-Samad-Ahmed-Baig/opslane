-- Migration: Create projects table
-- Created: 2025-01-14
-- Description: Projects represent source code repository locations

CREATE TABLE projects (
    -- Primary Key
    id TEXT PRIMARY KEY NOT NULL,

    -- Project Information
    name TEXT NOT NULL,                      -- Folder name (e.g., "opslane")
    local_repo_path TEXT NOT NULL UNIQUE,    -- Full path (e.g., "/Users/me/opslane")

    -- Activity Tracking
    last_opened_at TEXT,                     -- ISO 8601 timestamp for typeahead ordering

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Soft Delete
    is_deleted BOOLEAN NOT NULL DEFAULT 0
);

-- Index for fast path lookups (used by get_or_create_project)
CREATE INDEX idx_projects_path ON projects(local_repo_path) WHERE is_deleted = 0;

-- Index for sorting by recent activity (used by list_projects)
CREATE INDEX idx_projects_activity ON projects(last_opened_at DESC) WHERE is_deleted = 0;

-- Trigger to auto-update updated_at timestamp
CREATE TRIGGER projects_updated_at
AFTER UPDATE ON projects
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE projects SET updated_at = datetime('now') WHERE id = NEW.id;
END;
