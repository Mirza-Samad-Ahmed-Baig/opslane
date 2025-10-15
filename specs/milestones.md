# Milestones & Implementation Roadmap

## Overview

Feature-based implementation roadmap where each milestone delivers a complete, testable user feature (frontend + backend + database).

**Total Timeline:** 10 weeks to v1.0
**Team Size:** 1-2 developers
**Current Status:** Phase 0 Complete ✅

---

## Planning Principles

### Feature-Driven Development
Each milestone = one complete user feature (UI + Backend + Database + Tests)

### Vertical Slices
Build end-to-end before moving to next feature. Don't build all database tables upfront.

### Just-In-Time Implementation
Only create database tables/services when needed for a specific feature.

### Testable Increments
Every milestone produces a working, demoable feature.

---

## Phase 0: Foundation ✅

**Duration:** Week 1 (Days 1-5)

**Deliverables:**
- [x] Tauri 2.0 + React 19 scaffold
- [x] SQLite database with migrations
- [x] Logging (frontend + backend)
- [x] Error handling framework
- [x] CI/CD pipeline (GitHub Actions)
- [x] Pre-commit hooks
- [x] Documentation (README, CONTRIBUTING, specs)

**Test Results:**
- ✅ App starts successfully
- ✅ Database initializes
- ✅ All CI checks pass

---

## Phase 1: Session Creation

**Duration:** Week 2 (Days 6-10)
**Goal:** Users can create and list sessions

### User Story
> As a developer, I want to create multiple Claude sessions, so I can work on them in parallel.

**Acceptance Criteria:**
- [ ] Click "New Session" → fill form → session appears in dashboard
- [ ] Docker container created with cloned repo
- [ ] Can view all active sessions
- [ ] Can delete sessions
- [ ] Status updates in real-time (creating → ready)

---

### Milestone 1.1: Session Database (Days 6-7)

**Create:** `migrations/20250115000000_add_sessions.sql`

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    local_repo_path TEXT NOT NULL,
    base_branch TEXT DEFAULT 'main',
    container_id TEXT,
    container_name TEXT,
    container_branch TEXT,
    status TEXT DEFAULT 'created' CHECK(status IN ('created', 'cloning', 'ready', 'error')),
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    is_deleted BOOLEAN DEFAULT 0
);

CREATE INDEX idx_sessions_status ON sessions(status) WHERE is_deleted = 0;
```

**Create:** `src-tauri/src/models/session.rs`

```rust
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub local_repo_path: String,
    pub base_branch: String,
    pub container_id: Option<String>,
    pub status: String,
    // ... other fields
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewSession {
    pub name: String,
    pub local_repo_path: String,
    pub base_branch: String,
}
```

**Add to:** `src-tauri/src/database.rs`

```rust
impl Database {
    pub async fn create_session(&self, new: NewSession) -> Result<Session> {
        let id = Uuid::new_v4().to_string();
        sqlx::query_as!(Session, "INSERT INTO sessions ...")
            .fetch_one(&self.pool).await
    }

    pub async fn list_sessions(&self) -> Result<Vec<Session>> {
        sqlx::query_as!(Session, "SELECT * FROM sessions WHERE is_deleted = 0")
            .fetch_all(&self.pool).await
    }

    pub async fn update_session_status(&self, id: &str, status: &str) -> Result<()> {
        sqlx::query!("UPDATE sessions SET status = ? WHERE id = ?", status, id)
            .execute(&self.pool).await?;
        Ok(())
    }
}
```

**Tests:**
```rust
#[tokio::test]
async fn test_create_list_delete_session() {
    let db = setup_test_db().await;
    let session = db.create_session(NewSession { name: "Test".into(), ... }).await.unwrap();
    assert_eq!(session.status, "created");

    let sessions = db.list_sessions().await.unwrap();
    assert_eq!(sessions.len(), 1);
}
```

**Checklist:**
- [ ] Migration creates sessions table
- [ ] Can create/list/update/delete sessions
- [ ] All tests pass

---

### Milestone 1.2: Docker Service (Days 7-9)

**Add:** `Cargo.toml`
```toml
bollard = "0.18"
uuid = { version = "1.0", features = ["v4"] }
```

**Create:** `src-tauri/src/services/docker_service.rs`

```rust
use bollard::{Docker, container::*};

pub struct DockerService {
    client: Docker,
}

impl DockerService {
    pub fn new() -> Result<Self> {
        Ok(Self { client: Docker::connect_with_local_defaults()? })
    }

    pub async fn check_available(&self) -> Result<bool> {
        self.client.ping().await?;
        Ok(true)
    }

    pub async fn create_container(&self, name: &str, repo_path: &str) -> Result<String> {
        let config = Config {
            image: Some("opslane/claude-session:latest"),
            working_dir: Some("/workspace/repo"),
            // ... volume mounts
        };
        let response = self.client.create_container(Some(options), config).await?;
        Ok(response.id)
    }

    pub async fn start_container(&self, id: &str) -> Result<()> {
        self.client.start_container(id, None::<StartContainerOptions<String>>).await
    }
}
```

**Create:** `src-tauri/src/services/session_manager.rs`

```rust
pub struct SessionManager {
    db: Arc<Database>,
    docker: Arc<DockerService>,
}

impl SessionManager {
    pub async fn create_session(&self, new: NewSession) -> Result<Session> {
        // 1. Create DB record
        let session = self.db.create_session(new).await?;

        // 2. Create + start container
        let container_id = self.docker.create_container(&session.name, &session.local_repo_path).await?;
        self.docker.start_container(&container_id).await?;

        // 3. Update DB with container info
        self.db.update_session_status(&session.id, "ready").await?;

        Ok(session)
    }
}
```

**Create:** `src-tauri/src/commands/sessions.rs`

```rust
#[tauri::command]
pub async fn create_session(new: NewSession, state: State<AppState>) -> Result<Session, String> {
    state.session_manager.create_session(new).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_sessions(state: State<AppState>) -> Result<Vec<Session>, String> {
    state.session_manager.list_sessions().await.map_err(|e| e.to_string())
}
```

**Create:** `Dockerfile`

```dockerfile
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y git curl build-essential
RUN useradd -m claude
USER claude
WORKDIR /workspace
CMD ["tail", "-f", "/dev/null"]
```

Build: `docker build -t opslane/claude-session:latest .`

**Checklist:**
- [ ] Docker service connects to daemon
- [ ] Can create/start containers
- [ ] Session manager orchestrates DB + Docker
- [ ] Tauri commands work

---

### Milestone 1.3: Session UI (Days 9-10)

**Add:** `package.json`
```json
"zustand": "^4.4.7",
"@tanstack/react-query": "^5.17.0"
```

**Create:** `src/hooks/useSession.ts`

```typescript
export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => invoke<Session[]>('list_sessions'),
    refetchInterval: 5000,
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newSession: NewSession) => invoke<Session>('create_session', { newSession }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
}
```

**Create:** `src/features/sessions/SessionList.tsx`

```typescript
export function SessionList() {
  const { data: sessions } = useSessions();

  if (!sessions?.length) {
    return <EmptyState />;
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {sessions.map(s => <SessionCard key={s.id} session={s} />)}
    </div>
  );
}
```

**Create:** `src/features/sessions/SessionCard.tsx`

```typescript
export function SessionCard({ session }: { session: Session }) {
  const deleteSession = useDeleteSession();

  return (
    <div className="border rounded p-4">
      <div className="flex items-center gap-2">
        <StatusDot status={session.status} />
        <h3>{session.name}</h3>
      </div>
      <button onClick={() => deleteSession.mutate(session.id)}>Delete</button>
    </div>
  );
}
```

**Create:** `src/features/sessions/NewSessionDialog.tsx`

```typescript
export function NewSessionDialog({ isOpen, onClose }) {
  const [name, setName] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const createSession = useCreateSession();

  const handleSubmit = async (e) => {
    e.preventDefault();
    await createSession.mutateAsync({ name, local_repo_path: repoPath, base_branch: 'main' });
    onClose();
  };

  return isOpen ? (
    <Modal>
      <form onSubmit={handleSubmit}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Session name" />
        <input value={repoPath} onChange={e => setRepoPath(e.target.value)} placeholder="Repo path" />
        <button type="submit">Create</button>
      </form>
    </Modal>
  ) : null;
}
```

**Update:** `src/App.tsx`

```typescript
export default function App() {
  const [showNew, setShowNew] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <header>
        <h1>Opslane</h1>
        <button onClick={() => setShowNew(true)}>+ New Session</button>
      </header>
      <SessionList />
      <NewSessionDialog isOpen={showNew} onClose={() => setShowNew(false)} />
    </QueryClientProvider>
  );
}
```

**Checklist:**
- [ ] Dashboard shows sessions grid
- [ ] New Session dialog works
- [ ] Sessions auto-refresh
- [ ] Can delete sessions

---

### Phase 1 Complete ✅

**What Users Can Do:**
- ✅ Create sessions with Docker containers
- ✅ View all active sessions
- ✅ Delete sessions
- ✅ See real-time status updates

**Time:** Week 2 (5 days)
**Tests:** 10+ passing tests
**Next:** Phase 2 - Chat with Claude

---

## Phase 2: Chat with Claude

**Duration:** Week 3 (Days 11-15)
**Goal:** Users can chat with Claude in sessions

### User Story
> As a developer, I want to chat with Claude about my code, so Claude can make changes for me.

**Acceptance Criteria:**
- [ ] Click session → open chat interface
- [ ] Send messages to Claude
- [ ] See responses stream in real-time
- [ ] Message history persists

---

### Milestone 2.1: Messages Database (Days 11-12)

**Create:** `migrations/20250116000000_add_messages.sql`

```sql
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    message_type TEXT CHECK(message_type IN ('user', 'assistant', 'tool_use')),
    content TEXT NOT NULL,
    role TEXT CHECK(role IN ('user', 'assistant')),
    tool_name TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    sequence_number INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_session ON messages(session_id, sequence_number);
```

**Create:** `src-tauri/src/models/message.rs`

```rust
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub message_type: String,
    pub content: String,
    pub role: String,
    pub sequence_number: i64,
}
```

**Add to database.rs:**
```rust
pub async fn add_message(&self, new: NewMessage) -> Result<Message> { ... }
pub async fn get_messages(&self, session_id: &str) -> Result<Vec<Message>> { ... }
```

---

### Milestone 2.2: Claude Service (Days 12-13)

**Create:** `src-tauri/src/services/claude_service.rs`

```rust
pub struct ClaudeService {
    docker: Arc<DockerService>,
    db: Arc<Database>,
}

impl ClaudeService {
    pub async fn send_message(&self, session_id: &str, content: String)
        -> Result<mpsc::Receiver<StreamEvent>>
    {
        // 1. Save user message
        self.db.add_message(NewMessage { session_id, content, role: "user", ... }).await?;

        // 2. Execute Claude Code in container (mock for now)
        let (tx, rx) = mpsc::channel(100);

        tokio::spawn(async move {
            // Stream mock response
            tx.send(StreamEvent { type: "text_delta", data: "Hello" }).await;
        });

        Ok(rx)
    }
}
```

**Create:** `src-tauri/src/commands/messages.rs`

```rust
#[tauri::command]
pub async fn send_message(session_id: String, content: String, app: AppHandle, state: State<AppState>)
    -> Result<(), String>
{
    let mut rx = state.claude_service.send_message(&session_id, content).await?;

    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            app.emit(&format!("message-stream-{}", session_id), event);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn get_messages(session_id: String, state: State<AppState>) -> Result<Vec<Message>, String> {
    state.claude_service.get_message_history(&session_id).await.map_err(|e| e.to_string())
}
```

---

### Milestone 2.3: Chat UI (Days 14-15)

**Create:** `src/features/chat/ChatInterface.tsx`

```typescript
export function ChatInterface({ sessionId, onClose }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');

  useEffect(() => {
    invoke<Message[]>('get_messages', { sessionId }).then(setMessages);

    const unlisten = listen(`message-stream-${sessionId}`, (event) => {
      if (event.payload.type === 'text_delta') {
        setStreamingText(prev => prev + event.payload.data);
      }
    });

    return () => { unlisten.then(fn => fn()); };
  }, [sessionId]);

  const handleSend = (content: string) => {
    invoke('send_message', { sessionId, content });
  };

  return (
    <div className="flex flex-col h-screen">
      <MessageList messages={messages} streamingText={streamingText} />
      <MessageInput onSend={handleSend} />
    </div>
  );
}
```

**Create:** `src/features/chat/MessageList.tsx`
**Create:** `src/features/chat/MessageInput.tsx`

**Update SessionCard:**
```typescript
<button onClick={() => setShowChat(true)}>Chat</button>
{showChat && <ChatInterface sessionId={session.id} onClose={() => setShowChat(false)} />}
```

**Checklist:**
- [ ] Chat interface opens from session
- [ ] Can send messages
- [ ] Responses stream in real-time
- [ ] History loads on open

---

### Phase 2 Complete ✅

**What Users Can Do:**
- ✅ Open chat for any session
- ✅ Send messages to Claude
- ✅ See responses stream
- ✅ View message history

**Time:** Week 3 (5 days)
**Next:** Phase 3 - View Changes

---

## Phase 3: View Changes

**Duration:** Week 4 (Days 16-20)
**Goal:** Users can view file changes made by Claude

### Milestone 3.1: File Changes Database (Days 16-17)
### Milestone 3.2: Git Diff Service (Days 17-18)
### Milestone 3.3: Diff Viewer UI (Days 19-20)

---

## Phase 4: Sync-to-Local

**Duration:** Weeks 5-6 (Days 21-30)
**Goal:** Users can sync sessions to local repo for testing

### Milestone 4.1: Sync State Database (Days 21-22)
### Milestone 4.2: Git Operations (Days 23-25)
### Milestone 4.3: Sync Coordinator (Days 26-27)
### Milestone 4.4: Sync UI (Days 28-30)

---

## Phase 5: Polish & Launch

**Duration:** Weeks 7-10 (Days 31-50)
**Goal:** Bug fixes, performance, v1.0 release

### Milestone 5.1: Performance (Days 31-35)
- Container pooling
- Database indexing
- Virtual scrolling

### Milestone 5.2: Error Handling (Days 36-38)
- User-friendly errors
- Auto-retry logic
- Crash recovery

### Milestone 5.3: Testing (Days 39-42)
- 80% test coverage
- Integration tests
- E2E tests

### Milestone 5.4: Beta (Days 43-46)
- Beta builds (macOS/Windows/Linux)
- 10-20 beta testers
- Bug fixes

### Milestone 5.5: v1.0 Launch (Days 47-50)
- Final builds
- Code signing
- Release notes
- Launch announcement

---

## Success Criteria

### Technical Metrics
- Startup time: <2s
- Session creation: <5s
- Sync operation: <2s
- Memory usage: <200MB (5 sessions)
- Test coverage: >80%

### User Metrics
- User satisfaction: >80%
- Session success rate: >90%
- Weekly active users: 100+ (month 1)

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Docker complexity | Use bollard library, test extensively |
| Git conflicts | Always stash, detect conflicts early |
| Data loss | Never destructive without confirmation, auto-backup |
| Timeline slippage | Weekly reviews, cut low-priority features if needed |

---

**Document Version:** 2.0
**Last Updated:** 2025-01-15
