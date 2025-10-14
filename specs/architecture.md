# System Architecture

## Overview

Opslane is a desktop application for managing multiple Claude Code sessions in parallel. It uses Docker containers for isolation and provides a "sync-to-local" workflow for testing changes with existing development environments.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   DESKTOP APP (Tauri 2.0)                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Frontend (React 19 + TypeScript)            │  │
│  │  • Multi-session dashboard                            │  │
│  │  • Chat interface per session                         │  │
│  │  • Sync status indicator                              │  │
│  │  • Diff viewer & preview                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↕ IPC/Events                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │             Tauri Backend (Rust)                      │  │
│  │  • Docker container orchestrator                      │  │
│  │  • Session lifecycle manager                          │  │
│  │  • Git operations (patch, apply, stash)              │  │
│  │  • Sync state coordinator                             │  │
│  │  • Database layer (SQLite)                            │  │
│  │  • Stream coordinator for Claude output               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ↓
        ┌───────────────────────────────────────────────────┐
        │         LOCAL DOCKER ENGINE                        │
        │                                                    │
        │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐│
        │  │ Container 1  │  │ Container 2  │  │Container3││
        │  │ session-abc  │  │ session-xyz  │  │session-.. ││
        │  │              │  │              │  │          ││
        │  │ /workspace   │  │ /workspace   │  │/workspace││
        │  │ └─repo/      │  │ └─repo/      │  │└─repo/   ││
        │  │   (branch:   │  │   (branch:   │  │  (branch ││
        │  │   session/*) │  │   session/*) │  │  session)││
        │  │              │  │              │  │          ││
        │  │ Claude Code  │  │ Claude Code  │  │Claude Code││
        │  │ Running      │  │ Running      │  │Running   ││
        │  └──────────────┘  └──────────────┘  └──────────┘│
        └───────────────────────────────────────────────────┘
                            │
                            ↓
        ┌───────────────────────────────────────────────────┐
        │         USER'S LOCAL REPOSITORY                    │
        │  /projects/project_A (main branch)                │
        │  • Stays clean until sync                          │
        │  • One session synced at a time                    │
        │  • Hot reload works with existing dev servers      │
        └───────────────────────────────────────────────────┘
```

## Core Components

### 1. Frontend (React 19 + TypeScript)

**Technology Stack:**
- React 19 (latest with concurrent features)
- TypeScript (strict mode)
- Tailwind CSS (styling)
- Zustand (state management)
- React Query (data fetching/caching)

**Key Features:**
- Multi-session dashboard with live status
- Chat interface (reusable from codient)
- Sync status indicator (shows which session is active)
- Diff viewer with syntax highlighting
- Preview dialog for changes before sync
- Tool animations (reused from codient)

**Component Structure:**
```
src/
├── features/
│   ├── sessions/
│   │   ├── SessionList.tsx         # Grid of active sessions
│   │   ├── SessionCard.tsx         # Individual session card
│   │   ├── NewSessionDialog.tsx    # Create new session
│   │   └── SyncStatusBadge.tsx     # Shows sync state
│   ├── chat/
│   │   ├── ChatInterface.tsx       # Chat UI per session
│   │   ├── MessageList.tsx         # Message history
│   │   ├── MessageInput.tsx        # Input with image support
│   │   └── tools/                  # Tool animations
│   ├── diff/
│   │   ├── DiffViewer.tsx          # Syntax-highlighted diff
│   │   ├── FileChangesList.tsx     # List of changed files
│   │   └── PreviewDialog.tsx       # Preview before sync
│   └── settings/
│       ├── CredentialsForm.tsx     # Anthropic API key
│       └── GitHubSetup.tsx         # GitHub token
├── hooks/
│   ├── useTauriCommand.ts          # Wrapper for Tauri IPC
│   ├── useSession.ts               # Session operations
│   ├── useSyncState.ts             # Track sync state
│   └── useMessages.ts              # Message operations
└── stores/
    ├── sessionStore.ts             # Session state (Zustand)
    ├── syncStore.ts                # Sync state management
    └── settingsStore.ts            # App settings
```

### 2. Tauri Backend (Rust)

**Technology Stack:**
- Tauri 2.0 (desktop framework)
- Tokio (async runtime)
- SQLx (SQLite database)
- Bollard (Docker client)
- Git2 (Git operations)

**Module Structure:**
```rust
src-tauri/
├── main.rs                    // Tauri app entry
├── commands/                  // Tauri IPC commands
│   ├── sessions.rs            // Session CRUD
│   ├── messages.rs            // Message sending
│   ├── sync.rs                // Sync operations
│   ├── git.rs                 // Git operations
│   └── settings.rs            // Settings management
├── services/
│   ├── docker_service.rs      // Docker container management
│   ├── session_manager.rs     // Session lifecycle
│   ├── sync_coordinator.rs    // Sync-to-local logic
│   ├── streaming_service.rs   // Claude output streaming
│   ├── git_service.rs         // Git operations
│   └── database.rs            // SQLite operations
├── models/
│   ├── session.rs             // Session data structures
│   ├── message.rs             // Message types
│   ├── sync_state.rs          // Sync state tracking
│   └── container.rs           // Container metadata
└── state.rs                   // Global app state
```

### 3. Docker Container Service

**Responsibilities:**
- Create and manage Docker containers for sessions
- Execute Claude Code commands inside containers
- Stream stdout/stderr output
- Generate patches from container changes
- Cleanup containers when sessions end

**Container Lifecycle:**
```
Created → Cloning → Installing → Ready → Running → Idle → Cleanup
```

**Container Configuration:**
```rust
pub struct ContainerConfig {
    image: "opslane/claude-session:latest",
    cpu: 1.0,                    // 1 CPU core
    memory: 2 * 1024 * 1024 * 1024, // 2GB
    working_dir: "/workspace/repo",
    user: "claude",
}
```

### 4. Sync Coordinator

**Core Workflow:**

```rust
pub struct SyncCoordinator {
    currently_synced_session: Option<String>,
    stash_id: Option<String>,
    local_repo_path: PathBuf,
}

// Operations:
// 1. sync_session() - Apply session changes to local
// 2. unsync_current() - Restore clean local state
// 3. apply_and_keep() - Commit synced changes
// 4. check_conflicts() - Detect merge conflicts
```

**State Transitions:**
```
No Session Synced
    ↓ (sync_session)
Session X Synced
    ↓ (unsync_current)
No Session Synced
    ↓ (sync_session Y)
Session Y Synced
    ↓ (apply_and_keep)
Changes Committed → No Session Synced
```

### 5. Git Operations Service

**Key Functions:**
- Clone repo from local path to container
- Generate patches from container branches
- Apply patches to local repo
- Stash/restore local changes
- Detect and handle conflicts
- Commit applied changes

**Patch Generation:**
```bash
# Inside container
git diff main...HEAD > /tmp/session.patch

# Apply to local
cd /local/repo
git apply /tmp/session.patch
```

### 6. Database Layer (SQLite)

**Schema:**

```sql
-- Sessions table
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,

    -- Local repo info
    local_repo_path TEXT NOT NULL,
    base_branch TEXT NOT NULL,

    -- Container info
    container_id TEXT NOT NULL,
    container_branch TEXT NOT NULL,
    working_dir TEXT NOT NULL,

    -- Status
    status TEXT NOT NULL,  -- created, running, idle, synced, completed

    -- Timestamps
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_activity TEXT,

    -- Stats
    message_count INTEGER DEFAULT 0,
    files_changed INTEGER DEFAULT 0
);

-- Messages table
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    message_type TEXT NOT NULL,  -- user, assistant, tool_use, tool_result
    content TEXT NOT NULL,       -- JSON content blocks
    timestamp TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_session ON messages(session_id, timestamp);

-- Sync state table
CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1), -- Only one row
    synced_session_id TEXT,
    stash_id TEXT,
    synced_at TEXT,
    FOREIGN KEY (synced_session_id) REFERENCES sessions(id)
);

-- Credentials table (encrypted)
CREATE TABLE credentials (
    id TEXT PRIMARY KEY,
    credential_type TEXT NOT NULL,  -- anthropic_api_key, github_token
    encrypted_value TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Settings table
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

## Execution Modes

The application supports multiple execution modes (v1 focuses on Docker):

### v1: Docker (Local Containers)
- ✅ Containers run on user's machine
- ✅ Full isolation per session
- ✅ Sync-to-local for testing
- ✅ Works offline (after setup)

### v2: Worktrees (Future)
- Git worktrees for lightweight sessions
- Lower resource usage
- Faster startup
- No Docker required

### v3: Modal (Cloud - Future)
- Remote execution on Modal cloud
- Team collaboration
- No local resources needed
- Scalable compute

## Docker Image Design

**Dockerfile:**
```dockerfile
FROM ubuntu:22.04

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl git build-essential python3 python3-pip sudo \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN curl -fsSL https://raw.githubusercontent.com/anthropics/claude-code/main/install.sh | bash

# Create claude user
RUN useradd -m -s /bin/bash claude && \
    echo "claude ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Setup workspace
RUN mkdir -p /workspace && chown claude:claude /workspace

USER claude
WORKDIR /workspace

# Pre-configure git
RUN git config --global user.name "Claude Session" && \
    git config --global user.email "claude@opslane.local"

CMD ["tail", "-f", "/dev/null"]
```

**Build:**
```bash
docker build -t opslane/claude-session:latest .
```

## Communication Patterns

### 1. Tauri IPC (Frontend ↔ Backend)

**Commands:**
```typescript
// Session management
invoke('create_session', { name, repoPath, baseBranch })
invoke('list_sessions', { limit, offset })
invoke('get_session', { sessionId })
invoke('delete_session', { sessionId })

// Message operations
invoke('send_message', { sessionId, content, model })
invoke('get_messages', { sessionId })

// Sync operations
invoke('sync_to_local', { sessionId })
invoke('unsync_current')
invoke('apply_and_keep', { sessionId, commitMessage })
invoke('get_sync_state')

// Git operations
invoke('get_changes', { sessionId })
invoke('get_diff', { sessionId })
invoke('check_conflicts', { sessionId })

// Settings
invoke('save_anthropic_key', { apiKey })
invoke('get_settings')
```

**Events:**
```typescript
// Streaming events
listen('session:${sessionId}:stream', (event) => {
  // Handle Claude's streaming output
})

listen('session:${sessionId}:status', (event) => {
  // Handle status updates (cloning, ready, etc.)
})

listen('sync:state-changed', (event) => {
  // Handle sync state changes
})
```

### 2. Docker Communication (Backend ↔ Containers)

**Exec Commands:**
```rust
// Run Claude Code
docker.exec(container_id, [
    "su", "-", "claude", "-c",
    "cd /workspace/repo && claude --continue -p --output-format stream-json <message>"
])

// Generate patch
docker.exec(container_id, [
    "git", "-C", "/workspace/repo",
    "diff", "main...HEAD"
])

// Check status
docker.exec(container_id, [
    "git", "-C", "/workspace/repo",
    "status", "--porcelain"
])
```

## Performance Optimizations

### 1. Container Pooling
```rust
// Pre-warm 2-3 containers in background
// Reduces startup time from 60s → 2-3s
pub struct ContainerPool {
    ready_containers: VecDeque<Container>,
    target_size: usize, // 3 containers
}
```

### 2. Incremental Cloning
```rust
// Use shallow clone for faster setup
git clone --depth 1 --branch main <repo>
```

### 3. Shared Dependencies (Optional)
```rust
// Mount read-only node_modules if safe
host_config.binds = vec![
    format!("{}/node_modules:/workspace/repo/node_modules:ro", local_repo)
]
```

### 4. Caching
- Cache container images locally
- Cache git objects between containers
- Cache Claude Code binary

## Security Considerations

### 1. Credential Storage
- Encrypt Anthropic API keys in SQLite
- Use OS keychain via `tauri-plugin-keyring`
- Never log sensitive credentials

### 2. Container Isolation
- Each session runs in isolated container
- No network access between containers
- Resource limits prevent DoS

### 3. Local Repository Protection
- Validate git operations before execution
- Backup state before sync operations
- Prevent data loss with stash mechanism

### 4. Input Validation
- Sanitize user inputs before passing to shell
- Validate repository paths
- Check for git injection attacks

## Error Handling

### 1. Container Failures
```rust
if container_create_fails() {
    // Retry with exponential backoff
    // Fall back to worktree mode (future)
    // Show user-friendly error
}
```

### 2. Sync Conflicts
```rust
if git_apply_fails() {
    // Show conflict resolution UI
    // Offer manual resolution
    // Allow reverting to clean state
}
```

### 3. Docker Unavailable
```
Desktop App shows:
┌────────────────────────────────────────┐
│ ⚠️  Docker Not Available                │
├────────────────────────────────────────┤
│ Please install Docker Desktop to use   │
│ Opslane.                               │
│                                        │
│ [Install Docker] [Learn More]         │
└────────────────────────────────────────┘
```

## Monitoring & Observability

### 1. Session Metrics
- Track session duration
- Count messages per session
- Monitor container resource usage

### 2. Performance Metrics
- Sync operation latency
- Container startup time
- Patch generation time

### 3. Logging
```rust
// Structured logging
log::info!(
    session_id = %session.id,
    operation = "sync",
    duration_ms = elapsed.as_millis(),
    "Synced session to local"
);
```

## Future Enhancements

### Phase 2: Advanced Features
- Parallel testing view (split screen iframes)
- Automatic conflict resolution with Claude
- Session templates
- Team collaboration (share sessions)

### Phase 3: Cloud Integration
- Modal execution mode
- Remote session management
- Multi-user support

### Phase 4: IDE Integration
- VS Code extension
- JetBrains plugin
- Direct editor integration

## Technology Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| Desktop Framework | Tauri | 2.0 |
| Backend Language | Rust | 1.75+ |
| Frontend Framework | React | 19 |
| Language | TypeScript | 5.3+ |
| Styling | Tailwind CSS | 3.3+ |
| State Management | Zustand | 4.4+ |
| Database | SQLite | 3.40+ |
| Containerization | Docker | 24.0+ |
| Build Tool | Vite | 5.0+ |
| Git Operations | git2-rs | 0.18+ |
| Docker Client | bollard | 0.16+ |

## Deployment

### Build Process
```bash
# Install dependencies
npm install
cargo build

# Build for production
npm run tauri build

# Outputs:
# - macOS: .app, .dmg
# - Windows: .exe, .msi
# - Linux: .AppImage, .deb
```

### Distribution
- GitHub Releases
- Auto-update via Tauri updater
- Homebrew (macOS)
- Chocolatey (Windows)
- APT repository (Linux)

## Development Setup

### Prerequisites
- Node.js 18+
- Rust 1.75+
- Docker Desktop
- Git

### Quick Start
```bash
# Clone repo
git clone https://github.com/opslane/opslane
cd opslane

# Install dependencies
npm install

# Run in development
npm run tauri dev

# Build Docker image
docker build -f docker/Dockerfile -t opslane/claude-session:latest .
```

## Resources

- [Tauri Documentation](https://tauri.app)
- [Docker SDK for Rust](https://github.com/fussybeaver/bollard)
- [Claude Code CLI](https://github.com/anthropics/claude-code)
