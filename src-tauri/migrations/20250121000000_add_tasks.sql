-- Migration: Add tasks table
-- Created: 2025-01-21
-- Description: Tasks are individual work items within a project

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Index for querying tasks by project (excluding deleted)
CREATE INDEX idx_tasks_project ON tasks(project_id) WHERE is_deleted = 0;

-- Index for ordering within a project
CREATE INDEX idx_tasks_order ON tasks(project_id, order_index) WHERE is_deleted = 0;

-- Index for filtering by status
CREATE INDEX idx_tasks_status ON tasks(status) WHERE is_deleted = 0;
