-- Migration: Add projects table
-- Created: 2025-01-20
-- Description: Projects are containers for tasks within a session

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_deleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Index for querying projects by session (excluding deleted)
CREATE INDEX idx_projects_session ON projects(session_id) WHERE is_deleted = 0;

-- Index for ordering within a session
CREATE INDEX idx_projects_order ON projects(session_id, order_index) WHERE is_deleted = 0;
