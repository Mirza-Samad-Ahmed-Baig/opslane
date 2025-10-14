# Milestones & Implementation Roadmap

## Overview

This document defines the complete implementation roadmap for Opslane, breaking down the project into incremental, testable milestones. Each milestone builds on the previous ones, following the architecture, PRD, UX design, and database schema specifications.

**Total Timeline:** 12 weeks to v1.0
**Team Size:** 1-2 developers
**Release Strategy:** Incremental with alpha/beta testing phases

---

## Table of Contents

1. [Milestone Planning Principles](#milestone-planning-principles)
2. [Phase 0: Project Setup](#phase-0-project-setup)
3. [Phase 1: Foundation](#phase-1-foundation)
4. [Phase 2: Core Functionality](#phase-2-core-functionality)
5. [Phase 3: User Experience](#phase-3-user-experience)
6. [Phase 4: Polish & Testing](#phase-4-polish--testing)
7. [Phase 5: Beta & Launch](#phase-5-beta--launch)
8. [Post-Launch](#post-launch)
9. [Success Criteria](#success-criteria)
10. [Risk Mitigation](#risk-mitigation)

---

## Milestone Planning Principles

### Incremental Value Delivery
Each milestone delivers usable functionality that can be tested in isolation.

### Test-Driven Development
Every milestone includes automated tests and manual testing checklist.

### Vertical Slices
Implement features end-to-end (frontend → backend → database → Docker) before moving to next feature.

### Early Risk Reduction
Tackle highest-risk items first (Docker integration, git operations).

### Documentation-First
Each milestone includes documentation updates.

---

## Phase 0: Project Setup
**Duration:** Week 1 (Days 1-5)
**Goal:** Establish development environment and project scaffolding

### Milestone 0.1: Development Environment Setup
**Days 1-2**

**Deliverables:**
- [ ] Rust toolchain installed (1.70+)
- [ ] Node.js environment configured (18+)
- [ ] Docker Desktop installed and running
- [ ] Development dependencies installed
  - Tauri CLI
  - SQLx CLI
  - Cargo watch
  - Pre-commit hooks (rustfmt, clippy, prettier)

**Commands:**
```bash
# Verify installations
rustc --version
cargo --version
node --version
docker --version
```

**Acceptance Criteria:**
- All commands run successfully
- Can create and run "Hello World" Tauri app
- Docker engine responds to commands

**Documentation:**
- Update README.md with setup instructions
- Create CONTRIBUTING.md with development workflow

---

### Milestone 0.2: Project Structure & Build System
**Days 3-5**

**Deliverables:**
- [ ] Enhanced Tauri project structure (already scaffolded)
- [ ] SQLite database initialization
- [ ] CI/CD pipeline setup (GitHub Actions)
- [ ] Error handling framework
- [ ] Logging system (tracing + frontend console)

**File Structure:**
```
opslane/
├── src/                          # React frontend (already exists)
├── src-tauri/                    # Rust backend (already exists)
│   ├── migrations/              # NEW: SQLx migrations
│   │   └── 001_initial_schema.sql
│   ├── src/
│   │   ├── main.rs              # Entry point
│   │   ├── lib.rs               # App setup
│   │   ├── error.rs             # NEW: Error types
│   │   ├── state.rs             # NEW: App state
│   │   ├── commands/            # NEW: Tauri commands
│   │   ├── services/            # NEW: Business logic
│   │   └── models/              # NEW: Data models
│   └── Cargo.toml
├── .github/
│   └── workflows/
│       ├── ci.yml               # NEW: Build + test
│       └── release.yml          # NEW: Release builds
└── docs/                        # NEW: API docs
```

**Database Initialization:**
```sql
-- migrations/001_initial_schema.sql
CREATE TABLE sessions (...);
CREATE TABLE messages (...);
CREATE TABLE sync_state (...);
CREATE TABLE credentials (...);
CREATE TABLE settings (...);
-- See database-schema.md for complete schema
```

**Acceptance Criteria:**
- `npm run dev` starts frontend dev server
- `npm run tauri:dev` launches app with hot reload
- `sqlx migrate run` creates database successfully
- `cargo test` runs (no tests yet, but framework works)
- CI pipeline passes on GitHub

**Tests:**
- [ ] Database migrations apply cleanly
- [ ] Error types serialize correctly
- [ ] Logging captures info/warn/error levels

**Documentation:**
- Architecture diagram in docs/architecture.png
- Database ER diagram in docs/database.png
- API documentation stub in docs/api.md

---

## Phase 1: Foundation
**Duration:** Weeks 2-3 (Days 6-19)
**Goal:** Core backend services without UI

### Milestone 1.1: Database Layer
**Days 6-8**

**Deliverables:**
- [ ] SQLx connection pool setup
- [ ] CRUD operations for `sessions` table
- [ ] CRUD operations for `messages` table
- [ ] CRUD operations for `sync_state` table
- [ ] Encryption for `credentials` table

**Implementation Files:**
```rust
// src-tauri/src/services/database.rs
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn init() -> Result<Self>;
    pub async fn create_session(&self, session: NewSession) -> Result<Session>;
    pub async fn get_session(&self, id: &str) -> Result<Option<Session>>;
    pub async fn list_sessions(&self) -> Result<Vec<Session>>;
    pub async fn update_session_status(&self, id: &str, status: SessionStatus) -> Result<()>;
    pub async fn add_message(&self, message: NewMessage) -> Result<Message>;
    pub async fn get_messages(&self, session_id: &str) -> Result<Vec<Message>>;
}
```

**Acceptance Criteria:**
- Can create, read, update, delete sessions
- Foreign key constraints enforced
- Timestamps auto-populate
- Soft deletes work (archived_at)
- API keys encrypted with AES-256

**Tests:**
- [ ] Create session → Read back → Values match
- [ ] Update session status → Status persists
- [ ] Delete session → Messages cascade delete
- [ ] List sessions filters archived correctly
- [ ] Encrypted credentials decrypt successfully
- [ ] Concurrent writes don't corrupt data (WAL mode)

**Documentation:**
- Database API reference in docs/api.md#database
- Migration guide for schema changes

---

### Milestone 1.2: Docker Service
**Days 9-12**

**Deliverables:**
- [ ] Docker client setup (Bollard library)
- [ ] Container lifecycle management (create, start, stop, delete)
- [ ] Container pooling system (pre-warm 2-3 containers)
- [ ] Execute commands in containers
- [ ] Stream container logs
- [ ] Docker health check on app startup

**Implementation Files:**
```rust
// src-tauri/src/services/docker_service.rs
pub struct DockerService {
    client: Docker,
    pool: Mutex<ContainerPool>,
}

impl DockerService {
    pub async fn check_docker_available() -> Result<bool>;
    pub async fn create_container(&self, config: ContainerConfig) -> Result<String>;
    pub async fn start_container(&self, container_id: &str) -> Result<()>;
    pub async fn stop_container(&self, container_id: &str) -> Result<()>;
    pub async fn exec_command(&self, container_id: &str, cmd: Vec<&str>) -> Result<String>;
    pub async fn stream_logs(&self, container_id: &str) -> Result<LogStream>;
    pub async fn get_or_create_from_pool(&self) -> Result<String>;
}

// src-tauri/src/services/container_pool.rs
pub struct ContainerPool {
    ready: VecDeque<Container>,
    target_size: usize,
}

impl ContainerPool {
    pub fn new(target_size: usize) -> Self;
    pub async fn warm_up(&mut self, docker: &DockerService);
    pub fn get_ready(&mut self) -> Option<Container>;
    pub fn return_container(&mut self, container: Container);
}
```

**Docker Image:**
```dockerfile
# Dockerfile (in project root)
FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && apt-get install -y \
    git curl build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | sh

# Create non-root user
RUN useradd -m -s /bin/bash claude
WORKDIR /workspace
RUN chown claude:claude /workspace

USER claude
```

**Acceptance Criteria:**
- Can create container from image
- Can execute git commands in container
- Can start Claude Code CLI in container
- Container pool maintains 2-3 ready containers
- Getting container from pool takes <3 seconds
- Docker unavailable shows friendly error

**Tests:**
- [ ] Create container → Container ID returned
- [ ] Exec `echo "test"` → Output is "test"
- [ ] Stop container → Container stops
- [ ] Pool pre-warms 3 containers on startup
- [ ] Get from pool → Container ready in <3s
- [ ] Docker offline → Returns error, doesn't crash

**Documentation:**
- Docker setup guide in docs/docker.md
- Container image build instructions
- Troubleshooting Docker issues

---

### Milestone 1.3: Git Service
**Days 13-15**

**Deliverables:**
- [ ] Git operations wrapper (using git2-rs)
- [ ] Clone repository to container
- [ ] Create session branch
- [ ] Generate diff/patch
- [ ] Apply patch to local repo
- [ ] Stash/unstash local changes

**Implementation Files:**
```rust
// src-tauri/src/services/git_service.rs
pub struct GitService;

impl GitService {
    pub async fn clone_repo(
        &self,
        source_path: &Path,
        dest_path: &Path,
        branch: &str
    ) -> Result<()>;

    pub async fn create_branch(
        &self,
        repo_path: &Path,
        branch_name: &str,
        base_branch: &str
    ) -> Result<()>;

    pub async fn generate_patch(
        &self,
        repo_path: &Path,
        base_branch: &str,
        target_branch: &str
    ) -> Result<String>;

    pub async fn apply_patch(
        &self,
        repo_path: &Path,
        patch: &str
    ) -> Result<()>;

    pub async fn stash_changes(&self, repo_path: &Path) -> Result<String>;
    pub async fn unstash_changes(&self, repo_path: &Path, stash_id: &str) -> Result<()>;
}
```

**Acceptance Criteria:**
- Clone creates exact copy of repo
- Branch creation follows naming: `session/feat-YYYYMMDD-abc123`
- Patch captures all file changes
- Apply patch modifies working directory correctly
- Stash preserves uncommitted changes
- Merge conflicts detected and reported

**Tests:**
- [ ] Clone repo → .git exists in destination
- [ ] Create branch → Branch exists and checked out
- [ ] Generate patch → Patch has correct diff format
- [ ] Apply patch → Files modified correctly
- [ ] Apply conflicting patch → Returns conflict error
- [ ] Stash → Working dir clean
- [ ] Unstash → Changes restored

**Documentation:**
- Git workflow diagram in docs/git-workflow.md
- Branch naming conventions
- Conflict resolution guide

---

### Milestone 1.4: Session Manager
**Days 16-19**

**Deliverables:**
- [ ] Session lifecycle orchestration
- [ ] Create new session (clone + container + branch)
- [ ] Start session (launch Claude Code)
- [ ] Stop session (pause container)
- [ ] Delete session (cleanup container + data)
- [ ] Session status tracking

**Implementation Files:**
```rust
// src-tauri/src/services/session_manager.rs
pub struct SessionManager {
    db: Arc<Database>,
    docker: Arc<DockerService>,
    git: Arc<GitService>,
}

impl SessionManager {
    pub async fn create_session(
        &self,
        name: String,
        description: Option<String>,
        local_repo_path: PathBuf,
        base_branch: String,
    ) -> Result<Session>;

    pub async fn start_session(&self, session_id: &str) -> Result<()>;
    pub async fn stop_session(&self, session_id: &str) -> Result<()>;
    pub async fn delete_session(&self, session_id: &str) -> Result<()>;
    pub async fn get_session_status(&self, session_id: &str) -> Result<SessionStatus>;
    pub async fn list_active_sessions(&self) -> Result<Vec<Session>>;
}
```

**Session Creation Flow:**
```
1. Validate local repo exists and is git repo
2. Get container from pool (or create new)
3. Clone local repo into container at /workspace/repo
4. Create session branch: session/feat-{timestamp}-{short-id}
5. Insert session record in database
6. Return session ID
```

**Acceptance Criteria:**
- Create session completes in <10 seconds (with pool)
- Session appears in database with status='ready'
- Container has cloned repo on correct branch
- Stop session preserves container state
- Delete session removes container and database record
- List shows only active sessions (not archived)

**Tests:**
- [ ] Create session → Session ID returned
- [ ] Create session → Container running
- [ ] Create session → Branch exists in container
- [ ] Stop session → Container paused
- [ ] Start stopped session → Container resumes
- [ ] Delete session → Container removed
- [ ] List sessions → Only active returned

**Documentation:**
- Session lifecycle diagram in docs/session-lifecycle.md
- API reference for session operations

---

## Phase 2: Core Functionality
**Duration:** Weeks 4-6 (Days 20-40)
**Goal:** Implement chat, sync, and diff features

### Milestone 2.1: Claude Code Integration
**Days 20-24**

**Deliverables:**
- [ ] Execute Claude Code CLI in container
- [ ] Send messages to Claude
- [ ] Stream responses back to app
- [ ] Parse tool use from output
- [ ] Handle continuation prompts
- [ ] Store message history in database

**Implementation Files:**
```rust
// src-tauri/src/services/claude_service.rs
pub struct ClaudeService {
    docker: Arc<DockerService>,
    db: Arc<Database>,
}

impl ClaudeService {
    pub async fn send_message(
        &self,
        session_id: &str,
        content: String,
        images: Vec<ImageData>,
    ) -> Result<MessageStream>;

    pub async fn continue_session(&self, session_id: &str) -> Result<MessageStream>;
}

// src-tauri/src/models/message_stream.rs
pub struct MessageStream {
    receiver: mpsc::Receiver<StreamEvent>,
}

pub enum StreamEvent {
    TextDelta { text: String },
    ToolUse { tool: String, input: serde_json::Value },
    ToolResult { output: String },
    Done,
    Error { message: String },
}
```

**Claude CLI Execution:**
```bash
# Inside container
docker exec <container_id> \
  su - claude -c \
  "cd /workspace/repo && claude --continue -p --output-format stream-json '{message}'"
```

**Acceptance Criteria:**
- Send "Hello" → Receive streamed response
- Tool use (Read, Edit) captured in stream
- Message history persisted in database
- Images encoded and sent correctly
- Errors handled gracefully
- Long responses don't block UI

**Tests:**
- [ ] Send simple message → Response received
- [ ] Send with image → Image processed
- [ ] Parse tool use → Tool name and input extracted
- [ ] Stream events arrive in order
- [ ] Connection lost → Error event emitted
- [ ] Message history → All messages stored

**Documentation:**
- Claude Code CLI reference in docs/claude-cli.md
- Message format specification
- Error handling guide

---

### Milestone 2.2: Sync Coordinator
**Days 25-29**

**Deliverables:**
- [ ] Sync state management (one session at a time)
- [ ] Sync to local (apply patch to working directory)
- [ ] Unsync (revert to previous state)
- [ ] Sync conflict detection
- [ ] Sync status UI component

**Implementation Files:**
```rust
// src-tauri/src/services/sync_coordinator.rs
pub struct SyncCoordinator {
    db: Arc<Database>,
    git: Arc<GitService>,
}

impl SyncCoordinator {
    pub async fn sync_to_local(&self, session_id: &str) -> Result<SyncResult>;
    pub async fn unsync(&self) -> Result<()>;
    pub async fn get_synced_session(&self) -> Result<Option<String>>;
    pub async fn can_sync(&self, session_id: &str) -> Result<bool>;
}

pub struct SyncResult {
    pub success: bool,
    pub conflicts: Vec<String>,
    pub files_changed: Vec<String>,
}
```

**Sync Flow:**
```
1. Check if another session is synced → Error if yes
2. Stash any local changes
3. Generate patch from container
4. Apply patch to local working directory
5. Update sync_state table (session_id, stash_id)
6. Notify UI of sync status
```

**Unsync Flow:**
```
1. Get current synced session from sync_state
2. Unstash previous changes (if any)
3. Clear sync_state table
4. Notify UI
```

**Acceptance Criteria:**
- Sync session → Local repo matches container
- Only one session synced at a time
- Sync conflict → User notified with file list
- Unsync → Local repo reverts to pre-sync state
- Stash preserved until unsync or apply
- Dev server hot-reloads after sync

**Tests:**
- [ ] Sync session A → Local matches A
- [ ] Try sync session B while A synced → Error
- [ ] Unsync → Local reverted
- [ ] Sync with conflict → Conflict detected
- [ ] Apply patch → Stash discarded
- [ ] Sync → Unsync → Sync again → Works

**Documentation:**
- Sync workflow diagram in docs/sync-workflow.md
- Troubleshooting sync conflicts

---

### Milestone 2.3: File Change Tracking
**Days 30-32**

**Deliverables:**
- [ ] Detect file changes in container
- [ ] Parse git diff output
- [ ] Store file changes in database
- [ ] Provide file tree view data
- [ ] Calculate change statistics

**Implementation Files:**
```rust
// src-tauri/src/services/file_tracker.rs
pub struct FileTracker {
    docker: Arc<DockerService>,
    db: Arc<Database>,
}

impl FileTracker {
    pub async fn scan_changes(&self, session_id: &str) -> Result<Vec<FileChange>>;
    pub async fn get_file_diff(&self, session_id: &str, file_path: &str) -> Result<String>;
    pub async fn get_change_stats(&self, session_id: &str) -> Result<ChangeStats>;
}

#[derive(Debug, Clone)]
pub struct FileChange {
    pub path: String,
    pub change_type: ChangeType, // Added, Modified, Deleted
    pub additions: u32,
    pub deletions: u32,
}

pub struct ChangeStats {
    pub files_changed: u32,
    pub additions: u32,
    pub deletions: u32,
}
```

**Acceptance Criteria:**
- Detect added, modified, deleted files
- Calculate lines added/deleted per file
- Store changes in `file_changes` table
- Provide data for file tree UI
- Update on every tool use completion

**Tests:**
- [ ] Add file → Detected as "Added"
- [ ] Modify file → Detected with line counts
- [ ] Delete file → Detected as "Deleted"
- [ ] Multiple changes → All tracked
- [ ] Get diff for file → Returns unified diff

**Documentation:**
- File tracking implementation notes

---

### Milestone 2.4: Diff Viewer Backend
**Days 33-36**

**Deliverables:**
- [ ] Generate unified diff for files
- [ ] Syntax highlighting preparation (language detection)
- [ ] Side-by-side diff data structure
- [ ] API endpoints for diff viewer

**Implementation Files:**
```rust
// src-tauri/src/commands/diff.rs
#[tauri::command]
pub async fn get_file_diff(
    session_id: String,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<FileDiff, String>;

#[tauri::command]
pub async fn get_all_diffs(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<FileDiff>, String>;

pub struct FileDiff {
    pub path: String,
    pub language: String,
    pub old_content: String,
    pub new_content: String,
    pub hunks: Vec<DiffHunk>,
}
```

**Acceptance Criteria:**
- Generate diff for individual files
- Detect programming language (for syntax highlighting)
- Provide structured diff hunks
- Handle binary files gracefully
- Large diffs don't crash app

**Tests:**
- [ ] Diff JavaScript file → language="javascript"
- [ ] Diff shows correct hunks
- [ ] Binary file → Marked as binary
- [ ] Large file (>10K lines) → Diff generated

**Documentation:**
- Diff format specification in docs/diff-format.md

---

### Milestone 2.5: Apply & Commit
**Days 37-40**

**Deliverables:**
- [ ] Apply synced changes to local permanently
- [ ] Create git commit with changes
- [ ] Clean up session container
- [ ] Mark session as completed
- [ ] Discard session (without applying)

**Implementation Files:**
```rust
// src-tauri/src/services/apply_service.rs
pub struct ApplyService {
    sync: Arc<SyncCoordinator>,
    git: Arc<GitService>,
    db: Arc<Database>,
    docker: Arc<DockerService>,
}

impl ApplyService {
    pub async fn apply_and_commit(
        &self,
        session_id: &str,
        commit_message: String,
    ) -> Result<String>; // Returns commit hash

    pub async fn discard_session(&self, session_id: &str) -> Result<()>;
}
```

**Apply Flow:**
```
1. Ensure session is synced
2. Create git commit with changes
3. Discard stash (no longer needed)
4. Stop and remove container
5. Update session status to 'completed'
6. Clear sync_state
```

**Discard Flow:**
```
1. If session synced → Unsync first
2. Stop and remove container
3. Update session status to 'archived'
4. Keep database record for history
```

**Acceptance Criteria:**
- Apply creates commit on current branch
- Commit message editable
- Container cleaned up after apply
- Discard doesn't modify local repo
- Applied sessions marked 'completed'
- Discarded sessions marked 'archived'

**Tests:**
- [ ] Apply → Commit exists in git log
- [ ] Apply → Container removed
- [ ] Discard → Local repo unchanged
- [ ] Apply → Session status = 'completed'
- [ ] Discard → Session status = 'archived'

**Documentation:**
- Apply workflow in docs/apply-workflow.md

---

## Phase 3: User Experience
**Duration:** Weeks 7-9 (Days 41-63)
**Goal:** Build complete UI and interactions

### Milestone 3.1: Dashboard UI
**Days 41-46**

**Deliverables:**
- [ ] Session grid layout (responsive)
- [ ] Session cards with status indicators
- [ ] Sync status banner (global)
- [ ] Create new session dialog
- [ ] Empty state UI
- [ ] Loading states for async operations

**Components:**
```tsx
// src/features/sessions/SessionList.tsx
export function SessionList() {
  const sessions = useSessions();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sessions.map(session => (
        <SessionCard key={session.id} session={session} />
      ))}
    </div>
  );
}

// src/features/sessions/SessionCard.tsx
export function SessionCard({ session }: { session: Session }) {
  return (
    <div className="border rounded-lg p-4 hover:shadow-lg transition">
      <h3>{session.name}</h3>
      <SessionStatusBadge status={session.status} />
      <p className="text-sm text-gray-600">{session.description}</p>
      <div className="flex gap-2 mt-4">
        <Button onClick={() => openSession(session.id)}>Open</Button>
        <Button onClick={() => syncSession(session.id)}>Sync</Button>
      </div>
    </div>
  );
}

// src/features/sessions/NewSessionDialog.tsx
export function NewSessionDialog() {
  const [name, setName] = useState('');
  const [repoPath, setRepoPath] = useState('');

  return (
    <Dialog>
      <DialogContent>
        <h2>Create New Session</h2>
        <Input label="Session Name" value={name} onChange={setName} />
        <Input label="Repository Path" value={repoPath} onChange={setRepoPath} />
        <Button onClick={createSession}>Create</Button>
      </DialogContent>
    </Dialog>
  );
}
```

**Acceptance Criteria:**
- Dashboard shows all active sessions
- Session cards display name, status, stats
- Click card → Open session detail
- Click "New Session" → Open creation dialog
- Sync banner shows which session is synced
- Empty state when no sessions exist
- Loading spinner while fetching sessions

**Tests:**
- [ ] Render 5 sessions → All visible
- [ ] Click "Open" → Navigation works
- [ ] Click "Sync" → Sync initiated
- [ ] Empty state → Shows helpful message
- [ ] Create session → New session appears

**Documentation:**
- UI component library in docs/components.md
- Design system tokens

---

### Milestone 3.2: Chat Interface
**Days 47-52**

**Deliverables:**
- [ ] Chat message list with scrolling
- [ ] Message input with image upload
- [ ] Real-time message streaming
- [ ] Tool use animations
- [ ] Message history persistence
- [ ] Auto-scroll to latest message

**Components:**
```tsx
// src/features/chat/ChatInterface.tsx
export function ChatInterface({ sessionId }: { sessionId: string }) {
  const { messages, sendMessage } = useMessages(sessionId);

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} />
      <MessageInput onSend={sendMessage} />
    </div>
  );
}

// src/features/chat/MessageList.tsx
export function MessageList({ messages }: { messages: Message[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={scrollRef} />
    </div>
  );
}

// src/features/chat/tools/ToolAnimation.tsx
export function ToolAnimation({ tool, input }: ToolAnimationProps) {
  switch (tool) {
    case 'Read':
      return <ReadAnimation filePath={input.file_path} />;
    case 'Edit':
      return <EditAnimation filePath={input.file_path} />;
    case 'Bash':
      return <BashAnimation command={input.command} />;
    default:
      return <GenericToolAnimation tool={tool} />;
  }
}
```

**Acceptance Criteria:**
- Messages display in chronological order
- User messages align right, Claude left
- Tool use shows animated indicators
- Image attachments preview correctly
- Input supports paste images
- Auto-scroll to new messages
- Message history loads from database

**Tests:**
- [ ] Send message → Appears in list
- [ ] Receive response → Appears below user message
- [ ] Tool use → Animation plays
- [ ] Paste image → Image uploaded
- [ ] Scroll up → No auto-scroll
- [ ] New message → Auto-scroll to bottom

**Documentation:**
- Chat UI patterns in docs/chat-ui.md

---

### Milestone 3.3: Diff Viewer UI
**Days 53-57**

**Deliverables:**
- [ ] File tree navigation
- [ ] Side-by-side diff view
- [ ] Syntax highlighting (using Prism.js or similar)
- [ ] Unified diff view (alternative)
- [ ] Expand/collapse unchanged lines
- [ ] Search in diff

**Components:**
```tsx
// src/features/diff/DiffViewer.tsx
export function DiffViewer({ sessionId }: { sessionId: string }) {
  const { files } = useFileDiffs(sessionId);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  return (
    <div className="flex h-full">
      <FileTree files={files} onSelect={setSelectedFile} />
      {selectedFile && <DiffPanel file={selectedFile} />}
    </div>
  );
}

// src/features/diff/FileTree.tsx
export function FileTree({ files, onSelect }: FileTreeProps) {
  return (
    <div className="w-64 border-r overflow-y-auto">
      {files.map(file => (
        <FileTreeItem
          key={file.path}
          file={file}
          onClick={() => onSelect(file.path)}
        />
      ))}
    </div>
  );
}

// src/features/diff/DiffPanel.tsx
export function DiffPanel({ file }: { file: FileDiff }) {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');

  return (
    <div className="flex-1 flex flex-col">
      <DiffToolbar viewMode={viewMode} onViewModeChange={setViewMode} />
      {viewMode === 'split' ? (
        <SplitDiffView diff={file} />
      ) : (
        <UnifiedDiffView diff={file} />
      )}
    </div>
  );
}

// src/features/diff/SplitDiffView.tsx
export function SplitDiffView({ diff }: { diff: FileDiff }) {
  return (
    <div className="flex flex-1">
      <div className="flex-1 border-r">
        <SyntaxHighlighter language={diff.language}>
          {diff.old_content}
        </SyntaxHighlighter>
      </div>
      <div className="flex-1">
        <SyntaxHighlighter language={diff.language}>
          {diff.new_content}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
```

**Acceptance Criteria:**
- File tree shows all changed files
- Click file → Diff displayed
- Additions highlighted green
- Deletions highlighted red
- Toggle split/unified view
- Syntax highlighting works for major languages
- Collapsible unchanged sections

**Tests:**
- [ ] Click file → Diff loads
- [ ] Toggle view mode → Renders correctly
- [ ] JavaScript file → Syntax highlighted
- [ ] Large diff → Performance acceptable

**Documentation:**
- Diff viewer usage guide in docs/diff-viewer.md

---

### Milestone 3.4: Sync & Apply UI
**Days 58-61**

**Deliverables:**
- [ ] Sync button with confirmation
- [ ] Sync status indicator (global banner)
- [ ] Unsync button
- [ ] Apply dialog with commit message input
- [ ] Discard confirmation dialog
- [ ] Success/error notifications

**Components:**
```tsx
// src/features/sync/SyncStatusBanner.tsx
export function SyncStatusBanner() {
  const syncedSession = useSyncedSession();

  if (!syncedSession) return null;

  return (
    <div className="bg-blue-100 border-b border-blue-200 p-3 flex items-center justify-between">
      <div>
        <span className="font-semibold">{syncedSession.name}</span> is synced to local
      </div>
      <div className="flex gap-2">
        <Button onClick={applyChanges}>Apply & Commit</Button>
        <Button variant="outline" onClick={unsync}>Unsync</Button>
      </div>
    </div>
  );
}

// src/features/sync/ApplyDialog.tsx
export function ApplyDialog({ sessionId, onClose }: ApplyDialogProps) {
  const [message, setMessage] = useState('');

  const handleApply = async () => {
    await applyAndCommit(sessionId, message);
    toast.success('Changes applied and committed!');
    onClose();
  };

  return (
    <Dialog open onClose={onClose}>
      <DialogTitle>Apply Changes</DialogTitle>
      <DialogContent>
        <p>This will commit the changes to your local repository.</p>
        <Textarea
          label="Commit Message"
          value={message}
          onChange={setMessage}
          rows={3}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleApply} variant="primary">
          Apply & Commit
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

**Acceptance Criteria:**
- Sync button shows confirmation before sync
- Banner appears when session synced
- Unsync reverts local changes
- Apply shows commit message dialog
- Discard shows "Are you sure?" confirmation
- Toast notifications for success/errors

**Tests:**
- [ ] Click Sync → Confirmation shown
- [ ] Confirm sync → Banner appears
- [ ] Click Unsync → Changes reverted
- [ ] Apply with message → Commit created
- [ ] Discard → Session archived

**Documentation:**
- User guide for sync workflow in docs/user-guide.md

---

### Milestone 3.5: Settings & Onboarding
**Days 62-63**

**Deliverables:**
- [ ] Settings screen (API keys, preferences)
- [ ] First-run onboarding flow
- [ ] Docker health check UI
- [ ] Repository selection
- [ ] Keyboard shortcuts panel

**Components:**
```tsx
// src/features/settings/SettingsScreen.tsx
export function SettingsScreen() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1>Settings</h1>
      <CredentialsForm />
      <DockerSettings />
      <PreferencesForm />
    </div>
  );
}

// src/features/onboarding/OnboardingFlow.tsx
export function OnboardingFlow() {
  const [step, setStep] = useState(0);

  const steps = [
    <WelcomeStep />,
    <DockerCheckStep />,
    <ApiKeyStep />,
    <ReadyStep />,
  ];

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-full max-w-lg">
        {steps[step]}
        <OnboardingNavigation
          currentStep={step}
          totalSteps={steps.length}
          onNext={() => setStep(s => s + 1)}
          onPrev={() => setStep(s => s - 1)}
        />
      </div>
    </div>
  );
}
```

**Acceptance Criteria:**
- First run shows onboarding
- Docker check validates installation
- API key saved securely
- Settings persist between sessions
- Keyboard shortcuts listed

**Tests:**
- [ ] First run → Onboarding shown
- [ ] Docker installed → Check passes
- [ ] Docker missing → Error message
- [ ] Save API key → Key encrypted
- [ ] Change setting → Persists after restart

**Documentation:**
- Settings guide in docs/settings.md

---

## Phase 4: Polish & Testing
**Duration:** Week 10 (Days 64-70)
**Goal:** Bug fixes, performance, and polish

### Milestone 4.1: Performance Optimization
**Days 64-66**

**Deliverables:**
- [ ] Profile frontend render performance
- [ ] Optimize database queries (add indexes)
- [ ] Implement virtual scrolling for long message lists
- [ ] Lazy load file diffs
- [ ] Reduce memory usage
- [ ] Optimize Docker operations

**Optimizations:**
```rust
// Add indexes for common queries
CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_file_changes_session_id ON file_changes(session_id);

// Connection pooling
pub async fn init_database() -> Result<Database> {
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_path).await?;
    Ok(Database { pool })
}

// Lazy loading
#[tauri::command]
pub async fn get_messages_paginated(
    session_id: String,
    limit: i64,
    offset: i64,
) -> Result<Vec<Message>> {
    // Only load visible messages
}
```

**Acceptance Criteria:**
- App starts in <2 seconds
- Session creation <5 seconds (with pool)
- Sync to local <2 seconds
- Message list scrolls at 60 FPS
- Memory usage <200 MB with 5 sessions

**Tests:**
- [ ] Load 10,000 messages → No lag
- [ ] Create 5 sessions → Memory acceptable
- [ ] Profile shows no obvious bottlenecks

**Documentation:**
- Performance benchmarks in docs/performance.md

---

### Milestone 4.2: Error Handling & Recovery
**Days 67-68**

**Deliverables:**
- [ ] Graceful error messages (user-friendly)
- [ ] Automatic retry for transient failures
- [ ] Recovery from Docker disconnects
- [ ] Database backup on critical operations
- [ ] Crash reporting (optional telemetry)

**Error Handling:**
```rust
// User-friendly errors
pub enum AppError {
    DockerNotAvailable,
    GitOperationFailed { reason: String },
    SessionNotFound { session_id: String },
    SyncConflict { files: Vec<String> },
    DatabaseError { details: String },
}

impl AppError {
    pub fn user_message(&self) -> String {
        match self {
            Self::DockerNotAvailable =>
                "Docker is not running. Please start Docker Desktop.".into(),
            Self::GitOperationFailed { reason } =>
                format!("Git operation failed: {}", reason),
            // ... other errors
        }
    }
}

// Retry logic
pub async fn with_retry<F, T>(f: F, max_attempts: u32) -> Result<T>
where
    F: Fn() -> BoxFuture<'static, Result<T>>,
{
    let mut attempts = 0;
    loop {
        match f().await {
            Ok(val) => return Ok(val),
            Err(e) if attempts < max_attempts => {
                attempts += 1;
                tokio::time::sleep(Duration::from_secs(2u64.pow(attempts))).await;
            }
            Err(e) => return Err(e),
        }
    }
}
```

**Acceptance Criteria:**
- Docker dies → App shows error, allows restart
- Network blip → Auto-retry succeeds
- Disk full → Error message guides user
- Database corrupted → Backup restored
- All errors logged for debugging

**Tests:**
- [ ] Kill Docker → Error shown
- [ ] Restart Docker → App recovers
- [ ] Transient network error → Retries work
- [ ] Critical error → Backup created

**Documentation:**
- Error handling guide in docs/errors.md
- Troubleshooting common issues

---

### Milestone 4.3: Automated Testing
**Days 69-70**

**Deliverables:**
- [ ] Unit tests for all services (80% coverage)
- [ ] Integration tests for critical paths
- [ ] End-to-end tests (Playwright/Tauri test runner)
- [ ] Database migration tests
- [ ] CI pipeline runs all tests

**Test Structure:**
```
src-tauri/
├── tests/
│   ├── integration/
│   │   ├── test_session_lifecycle.rs
│   │   ├── test_sync_workflow.rs
│   │   └── test_git_operations.rs
│   └── unit/
│       ├── test_database.rs
│       ├── test_docker_service.rs
│       └── test_git_service.rs

src/
└── __tests__/
    ├── SessionList.test.tsx
    ├── ChatInterface.test.tsx
    └── DiffViewer.test.tsx
```

**Critical Test Cases:**
```rust
#[tokio::test]
async fn test_create_and_sync_session() {
    // 1. Create session
    let session = session_manager.create_session(...).await.unwrap();
    assert_eq!(session.status, SessionStatus::Ready);

    // 2. Send message
    claude_service.send_message(session.id, "Add a button").await.unwrap();

    // 3. Sync to local
    let result = sync_coordinator.sync_to_local(&session.id).await.unwrap();
    assert!(result.success);

    // 4. Verify files changed
    let files = file_tracker.scan_changes(&session.id).await.unwrap();
    assert!(!files.is_empty());

    // 5. Apply changes
    let commit = apply_service.apply_and_commit(&session.id, "Add button").await.unwrap();
    assert!(!commit.is_empty());
}
```

**Acceptance Criteria:**
- All unit tests pass
- Integration tests cover happy path
- E2E test covers full workflow
- CI runs tests on every commit
- Code coverage >80%

**Documentation:**
- Testing guide in docs/testing.md

---

## Phase 5: Beta & Launch
**Duration:** Weeks 11-12 (Days 71-84)
**Goal:** Beta testing, bug fixes, and v1.0 launch

### Milestone 5.1: Beta Release
**Days 71-75**

**Deliverables:**
- [ ] Beta builds for macOS, Windows, Linux
- [ ] Public beta testing program (10-20 users)
- [ ] Feedback collection system
- [ ] Bug tracking and prioritization
- [ ] Performance monitoring

**Beta Checklist:**
- [ ] All Phase 3 features complete
- [ ] No critical bugs
- [ ] User documentation complete
- [ ] Installation guides for all platforms
- [ ] Support channel (Discord/GitHub Discussions)

**Beta Testing Focus:**
- Real-world repository testing
- Performance under load
- Edge case discovery
- UX feedback
- Installation issues

**Acceptance Criteria:**
- 10+ beta testers successfully install
- No data loss incidents
- Critical bugs <5
- User satisfaction score >70%

**Documentation:**
- Beta testing guide
- Known issues list
- Feedback template

---

### Milestone 5.2: Bug Fixes & Refinement
**Days 76-80**

**Deliverables:**
- [ ] Fix all critical bugs from beta
- [ ] Address top 10 user feedback items
- [ ] Performance improvements from profiling
- [ ] UI polish (animations, transitions)
- [ ] Accessibility improvements

**Bug Fix Priority:**
1. **P0 (Critical):** Data loss, crashes, docker failures
2. **P1 (High):** Sync conflicts, UI blocking errors
3. **P2 (Medium):** UX polish, minor bugs
4. **P3 (Low):** Nice-to-haves, future features

**Acceptance Criteria:**
- All P0 bugs fixed
- >80% P1 bugs fixed
- Beta testers report improved stability
- No regressions from fixes

**Documentation:**
- Changelog for v1.0
- Migration guide (if needed)

---

### Milestone 5.3: v1.0 Launch
**Days 81-84**

**Deliverables:**
- [ ] Final builds for all platforms
- [ ] Signed binaries (macOS notarization, Windows code signing)
- [ ] Release notes and changelog
- [ ] Marketing website/landing page
- [ ] Launch announcement (Twitter, HN, Reddit)
- [ ] Documentation website

**Launch Checklist:**
- [ ] All tests passing
- [ ] Documentation complete
- [ ] Installers tested on clean machines
- [ ] Auto-update mechanism working
- [ ] Crash reporting enabled
- [ ] Analytics (optional, privacy-respecting)
- [ ] Support channels ready

**Release Assets:**
```
v1.0.0/
├── Opslane_1.0.0_x64.dmg          # macOS Intel
├── Opslane_1.0.0_aarch64.dmg      # macOS Apple Silicon
├── Opslane_1.0.0_x64.msi          # Windows
├── Opslane_1.0.0_amd64.deb        # Linux Debian/Ubuntu
└── Opslane_1.0.0_x86_64.AppImage  # Linux Universal
```

**Acceptance Criteria:**
- Clean installs on all platforms
- No critical issues in first 48 hours
- User satisfaction >80%
- 100+ downloads in first week

**Documentation:**
- Complete user guide at docs.opslane.com
- Video tutorials (optional)
- FAQ

---

## Post-Launch

### Week 13+: Maintenance & v1.1

**Deliverables:**
- [ ] Monitor crash reports and analytics
- [ ] Fix bugs reported by users
- [ ] Incremental improvements
- [ ] Plan v1.1 features

**v1.1 Feature Ideas:**
- Keyboard shortcuts
- Dark mode
- Session templates
- Export/import sessions
- Improved conflict resolution

---

### v2.0 Planning (Months 4-6)

**Major Features:**
- Worktree mode (lightweight alternative to Docker)
- Cloud execution with Modal/E2B
- Team collaboration features
- Multi-repository support
- Advanced merge conflict resolution

See PRD for complete v2.0/v3.0 roadmap.

---

## Success Criteria

### Technical Metrics
- **Startup Time:** <2 seconds
- **Session Creation:** <5 seconds (with pool)
- **Sync to Local:** <2 seconds
- **Memory Usage:** <200 MB (5 sessions)
- **Test Coverage:** >80%
- **Crash Rate:** <1% of sessions

### User Metrics
- **User Satisfaction:** >80% (surveys)
- **Weekly Active Users:** 100+ by end of month 1
- **Session Success Rate:** >90% (sessions applied without errors)
- **Time Saved:** 50% reduction in time managing parallel work (vs manual git worktrees)

### Product Metrics
- **Feature Completion:** 100% of v1.0 scope
- **Bug Density:** <0.5 bugs per feature
- **Documentation:** 100% of features documented
- **Platform Support:** macOS, Windows, Linux (all working)

---

## Risk Mitigation

### Risk: Docker Integration Complexity
**Mitigation:**
- Start Docker integration early (Phase 1)
- Build container pooling from the start
- Test on multiple Docker versions
- Provide clear Docker installation guides

### Risk: Performance Issues with Large Repos
**Mitigation:**
- Use shallow clones (--depth 1)
- Implement progressive loading
- Set reasonable resource limits
- Test with real-world large repos

### Risk: Git Conflicts During Sync
**Mitigation:**
- Always stash before sync
- Detect conflicts before applying
- Provide clear conflict UI
- Allow manual resolution

### Risk: User Data Loss
**Mitigation:**
- Never destructive without confirmation
- Auto-backup database before critical ops
- Keep containers until explicit discard
- Comprehensive error handling

### Risk: Timeline Slippage
**Mitigation:**
- Weekly progress reviews
- Cut low-priority features if needed
- Focus on core workflow first
- Parallel work where possible

---

## Dependencies & Prerequisites

### Before Phase 1
- [ ] Tauri 2.0 scaffold complete (✓ Done)
- [ ] Docker Desktop installed on dev machine
- [ ] Test repository prepared
- [ ] Design specs reviewed and approved

### External Dependencies
- **Tauri 2.0:** Desktop framework
- **Docker Engine API:** Container management
- **Claude Code CLI:** AI assistant integration
- **Git:** Version control operations

### Team Skills Required
- Rust (intermediate+)
- TypeScript/React (intermediate+)
- Docker (basics)
- Git internals (intermediate)
- Desktop app development (basics)

---

## Milestone Tracking

### Progress Dashboard (Example)

| Phase | Milestone | Status | Start Date | End Date | Owner |
|-------|-----------|--------|------------|----------|-------|
| 0.1 | Dev Environment | ✅ Done | 2025-01-20 | 2025-01-21 | Dev |
| 0.2 | Project Structure | ✅ Done | 2025-01-22 | 2025-01-24 | Dev |
| 1.1 | Database Layer | 🚧 In Progress | 2025-01-27 | 2025-01-29 | Dev |
| 1.2 | Docker Service | 📅 Planned | 2025-01-30 | 2025-02-02 | Dev |
| ... | ... | ... | ... | ... | ... |

### Weekly Reviews
- **Monday:** Plan week's milestones
- **Friday:** Review completed work, adjust timeline
- **Document:** Blockers, decisions, scope changes

### Communication
- Daily standups (async if solo)
- Weekly progress updates in session notes
- Document all architectural decisions
- Keep stakeholders informed of timeline changes

---

## Appendix

### A. Testing Checklist

**Before Each Release:**
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Manual smoke test of critical paths
- [ ] Performance benchmarks acceptable
- [ ] No memory leaks detected
- [ ] Documentation updated
- [ ] Changelog updated

### B. Tools & Libraries

**Backend (Rust):**
- `tauri` - Desktop framework
- `tokio` - Async runtime
- `sqlx` - Database
- `bollard` - Docker client
- `git2` - Git operations
- `serde` - Serialization
- `tracing` - Logging

**Frontend (React):**
- `react` - UI library
- `zustand` - State management
- `react-query` - Data fetching
- `tailwindcss` - Styling
- `prismjs` - Syntax highlighting
- `react-diff-viewer` - Diff UI

### C. Deployment Checklist

**Before v1.0 Release:**
- [ ] Code signing certificates obtained
- [ ] macOS app notarized
- [ ] Windows installer signed
- [ ] Auto-update server configured
- [ ] Analytics configured (if enabled)
- [ ] Crash reporting configured
- [ ] Documentation site deployed
- [ ] GitHub releases configured

---

**Document Version:** 1.0
**Last Updated:** 2025-01-14
**Prepared By:** Opslane Team
**Based On:** architecture.md, prd.md, ux-design.md, database-schema.md

---

*This roadmap is a living document and will be updated as the project progresses. Each milestone is designed to be self-contained and testable, ensuring steady progress toward v1.0.*
