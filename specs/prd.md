# Product Requirements Document (PRD)

## Product Overview

### Product Name
Opslane - Multi-Session Claude Code Manager

### Product Vision
Enable developers to efficiently manage multiple Claude Code sessions in parallel, eliminating the complexity of git worktrees while maintaining clean local repositories through an intuitive sync-to-local workflow.

### Target Audience
- Individual developers working on multiple features simultaneously
- Teams using Claude Code for development
- Developers who want to experiment with different approaches in parallel
- Users who need to maintain clean local repositories while iterating

### Problem Statement
Current Claude Code usage has significant limitations:
1. **Single Session Limitation**: Running multiple Claude sessions requires complex git worktree management
2. **Testing Difficulty**: Each worktree needs separate dev servers on different ports
3. **Merge Complexity**: Combining changes from multiple sessions is error-prone
4. **Resource Waste**: Can't compare different approaches side-by-side
5. **Clean State Loss**: Local repository gets cluttered with experimental changes

### Solution
A desktop application that:
- Manages multiple Claude Code sessions in isolated Docker containers
- Provides one-click "sync-to-local" for testing with existing dev servers
- Enables easy switching between sessions without merge conflicts
- Maintains local repository cleanliness until changes are approved
- Offers visual diff previews before applying changes

---

## Product Goals

### Primary Goals
1. **Enable Parallel Development**: Allow 3+ Claude sessions running simultaneously
2. **Simplify Testing**: One-click sync to test with existing localhost dev servers
3. **Maintain Clean Repo**: Keep local repository untouched until changes are approved
4. **Reduce Cognitive Load**: Simple UI to manage multiple sessions without complexity

### Success Metrics
- Time to create new session: < 5 seconds
- Time to sync session to local: < 2 seconds
- User can manage 3+ sessions without confusion
- Zero data loss incidents
- 90% user satisfaction with workflow

### Non-Goals (v1)
- ❌ Team collaboration features
- ❌ Cloud execution (Modal integration in v2)
- ❌ IDE plugins/extensions
- ❌ CI/CD integration
- ❌ Mobile app

---

## User Personas

### Persona 1: Sarah - Full-Stack Developer
**Background:**
- Works on React + Node.js applications
- Frequently experiments with multiple UI approaches
- Needs to test changes locally before committing

**Pain Points:**
- Managing git worktrees is complex
- Running multiple dev servers on different ports is confusing
- Switching between approaches loses context

**Use Case:**
Sarah is building a dashboard and wants to try 3 different layouts. She creates 3 Opslane sessions, each with a different approach. She syncs each session to her local repo one at a time, tests at localhost:3000, and chooses the best one to commit.

### Persona 2: Alex - Backend Developer
**Background:**
- Works on Python/Django APIs
- Needs to fix bugs and add features in parallel
- Wants to keep main branch clean

**Pain Points:**
- Git worktrees break IDE integrations
- Testing database migrations across branches is hard
- Committing half-finished work to test it

**Use Case:**
Alex has a bug to fix and a feature to add. He creates 2 Opslane sessions. While Claude works on the feature in one session, he syncs the bug fix to test it locally, then switches back to review the feature progress.

### Persona 3: Jamie - Solo Founder
**Background:**
- Building MVP quickly
- Limited git expertise
- Wants to experiment without breaking things

**Pain Points:**
- Fear of breaking working code
- Don't understand git internals well
- Need simple, safe experimentation

**Use Case:**
Jamie wants to refactor authentication but isn't sure if it'll work. She creates an Opslane session, lets Claude refactor it, syncs to test locally, and if it breaks, simply unsyncs and tries a different approach without any git cleanup.

---

## Feature Requirements

## v1.0 Features (MVP)

### F1: Session Management

#### F1.1: Create Session
**Description:** Create a new Claude Code session in an isolated Docker container.

**User Story:**
> As a developer, I want to create a new Claude session for a specific task so that I can work on multiple features independently.

**Acceptance Criteria:**
- [ ] User can click "New Session" button
- [ ] User provides: session name, local repo path, base branch (optional, defaults to main)
- [ ] System creates Docker container with cloned repo
- [ ] Session appears in dashboard within 5 seconds
- [ ] Session has unique branch name (e.g., `session/feat-20251014-abc123`)

**UI Mockup:**
```
┌─────────────────────────────────────┐
│ Create New Session                  │
├─────────────────────────────────────┤
│ Session Name:                       │
│ [Add dark mode toggle         ]    │
│                                     │
│ Repository Path:                    │
│ [/Users/me/projects/my-app    ] 📁 │
│                                     │
│ Base Branch: (optional)             │
│ [main ▼]                            │
│                                     │
│ [Cancel]              [Create] ✓   │
└─────────────────────────────────────┘
```

**Technical Notes:**
- Use Docker API to create container
- Clone repo using `git clone file://` for speed
- Generate unique session ID (UUID v4)
- Store in SQLite database

---

#### F1.2: List Sessions
**Description:** Display all active and completed sessions.

**User Story:**
> As a developer, I want to see all my Claude sessions at a glance so that I can quickly switch between tasks.

**Acceptance Criteria:**
- [ ] Dashboard shows grid of session cards
- [ ] Each card displays: name, status, branch name, files changed count
- [ ] Sessions are sorted by last activity (most recent first)
- [ ] Active session is highlighted
- [ ] Synced session has special indicator

**UI Mockup:**
```
┌─────────────────────────────────────────────────────────┐
│ Sessions (3 active)                    [+ New Session]  │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐ ┌─────────────────────┐        │
│ │ 🟢 Add Dark Mode    │ │ ⚪ Fix Login Bug    │        │
│ │ SYNCED              │ │ Ready               │        │
│ │ session/dark-mode   │ │ session/login-fix   │        │
│ │ 4 files changed     │ │ 3 files changed     │        │
│ │                     │ │                     │        │
│ │ [Chat] [Unsync]     │ │ [Chat] [Sync]       │        │
│ │ [Apply]             │ │ [View Diff]         │        │
│ └─────────────────────┘ └─────────────────────┘        │
│                                                          │
│ ┌─────────────────────┐                                 │
│ │ ⚪ Refactor API     │                                 │
│ │ Idle (5m ago)       │                                 │
│ │ session/refactor    │                                 │
│ │ 7 files changed     │                                 │
│ │                     │                                 │
│ │ [Chat] [Sync]       │                                 │
│ │ [Discard]           │                                 │
│ └─────────────────────┘                                 │
└─────────────────────────────────────────────────────────┘
```

**Technical Notes:**
- Query SQLite for sessions
- Show status badge (created, running, idle, synced, completed)
- Update in real-time using Tauri events

---

#### F1.3: Delete/Discard Session
**Description:** Remove a session and cleanup resources.

**User Story:**
> As a developer, I want to discard a session that didn't work out so that I can free up resources and keep my workspace clean.

**Acceptance Criteria:**
- [ ] User can click "Discard" on any session card
- [ ] Confirmation dialog appears
- [ ] System stops Docker container
- [ ] System removes container
- [ ] Session removed from database
- [ ] UI updates to remove session card

**Confirmation Dialog:**
```
┌─────────────────────────────────────────┐
│ Discard Session?                         │
├─────────────────────────────────────────┤
│ Are you sure you want to discard:       │
│ "Fix Login Bug"                         │
│                                          │
│ This will:                              │
│ • Delete the Docker container           │
│ • Remove all changes                    │
│ • Cannot be undone                      │
│                                          │
│ [Cancel]              [Discard] ⚠️      │
└─────────────────────────────────────────┘
```

---

### F2: Chat Interface

#### F2.1: Send Messages to Claude
**Description:** Chat with Claude Code within a session.

**User Story:**
> As a developer, I want to chat with Claude about my code so that I can get help implementing features and fixing bugs.

**Acceptance Criteria:**
- [ ] User can type messages in chat interface
- [ ] Support text-only messages in v1
- [ ] Messages sent to Claude Code in container
- [ ] Claude's responses stream in real-time
- [ ] Tool use animations show what Claude is doing
- [ ] Message history persisted to database

**UI Mockup:**
```
┌──────────────────────────────────────────────────────┐
│ Session: Add Dark Mode                    [Close] ✕  │
├──────────────────────────────────────────────────────┤
│                                                       │
│ You: Add a dark mode toggle to the header            │
│                                                       │
│ Claude: I'll help you add a dark mode toggle...      │
│ [Using tool: Write]                                  │
│  → src/components/DarkModeToggle.tsx                 │
│                                                       │
│ [Using tool: Edit]                                   │
│  → src/App.tsx                                       │
│                                                       │
│ Claude: I've added a dark mode toggle. The toggle... │
│                                                       │
├──────────────────────────────────────────────────────┤
│ Message Claude...                           [Send] → │
└──────────────────────────────────────────────────────┘
```

**Technical Notes:**
- Execute Claude Code with `--output-format stream-json`
- Parse streaming JSON events
- Show tool animations (reuse from codient)
- Store messages in SQLite

---

#### F2.2: View Chat History
**Description:** View full conversation history for a session.

**User Story:**
> As a developer, I want to see my full conversation with Claude so that I can understand what changes were made and why.

**Acceptance Criteria:**
- [ ] Chat history loads when opening session
- [ ] All messages visible (user and assistant)
- [ ] Tool use blocks are expandable
- [ ] Auto-scroll to bottom on new messages
- [ ] History persists across app restarts

---

### F3: Sync-to-Local Workflow

#### F3.1: Sync Session to Local
**Description:** Apply a session's changes to the local repository for testing.

**User Story:**
> As a developer, I want to sync a session's changes to my local repo so that I can test them with my existing dev servers at localhost:3000.

**Acceptance Criteria:**
- [ ] User clicks "Sync to Local" button
- [ ] System checks if another session is synced
- [ ] System checks for uncommitted local changes
- [ ] System generates patch from container
- [ ] System applies patch to local repo
- [ ] Local dev servers detect changes and hot reload
- [ ] Session marked as "SYNCED" in UI
- [ ] Sync completes in < 2 seconds

**Flow Diagram:**
```
User clicks "Sync" → Check local state → Stash if needed →
Generate patch → Apply patch → Update UI → Hot reload
```

**Edge Cases:**
1. **Local has uncommitted changes:**
   ```
   ┌────────────────────────────────────────┐
   │ ⚠️  Uncommitted Local Changes          │
   ├────────────────────────────────────────┤
   │ You have uncommitted changes:          │
   │ • src/utils/helper.ts                  │
   │ • README.md                            │
   │                                        │
   │ [Stash & Sync] [Cancel]                │
   └────────────────────────────────────────┘
   ```

2. **Another session is synced:**
   ```
   ┌────────────────────────────────────────┐
   │ Session "Add Dark Mode" is synced      │
   ├────────────────────────────────────────┤
   │ Syncing this session will:             │
   │ • Remove "Add Dark Mode" changes       │
   │ • Apply "Fix Login Bug" changes        │
   │                                        │
   │ [Switch] [Cancel]                      │
   └────────────────────────────────────────┘
   ```

**Technical Notes:**
- Use `git diff main...HEAD` in container
- Apply with `git apply` to local
- Track sync state in `sync_state` table
- Emit `sync:state-changed` event

---

#### F3.2: Unsync Current Session
**Description:** Remove synced changes and restore clean local state.

**User Story:**
> As a developer, I want to unsync the current session so that I can return my local repo to a clean state or sync a different session.

**Acceptance Criteria:**
- [ ] User clicks "Unsync" button
- [ ] System removes synced changes from local
- [ ] System restores original state
- [ ] Local dev servers reload with clean code
- [ ] Session no longer marked as synced
- [ ] User can now sync a different session

**Technical Notes:**
- Use `git restore .` and `git clean -fd`
- Restore from stash if one was created
- Clear `synced_session_id` in database

---

#### F3.3: Apply and Keep Changes
**Description:** Commit synced changes to the local repository permanently.

**User Story:**
> As a developer, I want to commit the synced changes so that I can permanently add them to my repository.

**Acceptance Criteria:**
- [ ] User clicks "Apply & Keep" button
- [ ] Commit message dialog appears
- [ ] User enters commit message (optional, defaults to session name)
- [ ] System stages all synced changes
- [ ] System creates git commit
- [ ] Session marked as "completed"
- [ ] Sync state cleared
- [ ] User can push to remote normally

**Commit Dialog:**
```
┌─────────────────────────────────────────┐
│ Commit Changes                           │
├─────────────────────────────────────────┤
│ Session: Add Dark Mode                  │
│ Files changed: 4                         │
│                                          │
│ Commit message:                          │
│ [feat: add dark mode toggle to header ] │
│                                          │
│ [Cancel]              [Commit] ✓        │
└─────────────────────────────────────────┘
```

**Technical Notes:**
- Use `git add .` to stage
- Use `git2-rs` to create commit
- Mark session as completed
- Keep container for history (optional)

---

### F4: Change Preview & Diff

#### F4.1: View Changed Files
**Description:** List all files modified in a session.

**User Story:**
> As a developer, I want to see which files were changed so that I understand the scope of modifications.

**Acceptance Criteria:**
- [ ] User clicks "View Changes" button
- [ ] Dialog shows list of changed files
- [ ] Each file shows addition/deletion counts
- [ ] Files categorized by type (added, modified, deleted)
- [ ] User can click file to see diff

**UI Mockup:**
```
┌──────────────────────────────────────────┐
│ Changes in "Add Dark Mode"               │
├──────────────────────────────────────────┤
│ Modified (3):                            │
│  • src/App.tsx               +5 -2      │
│  • src/components/Header.tsx +12 -1     │
│  • tailwind.config.js        +3 -0      │
│                                          │
│ Added (1):                               │
│  • src/components/DarkModeToggle.tsx     │
│                                          │
│ [View Full Diff]              [Close]   │
└──────────────────────────────────────────┘
```

---

#### F4.2: View Diff
**Description:** Show syntax-highlighted diff of changes.

**User Story:**
> As a developer, I want to see the exact code changes so that I can review them before syncing.

**Acceptance Criteria:**
- [ ] User clicks "View Diff" button
- [ ] Full diff displayed with syntax highlighting
- [ ] Additions shown in green, deletions in red
- [ ] Line numbers displayed
- [ ] Diff is scrollable
- [ ] User can copy diff text

**UI Mockup:**
```
┌──────────────────────────────────────────────────────┐
│ Diff: src/App.tsx                          [Close] ✕ │
├──────────────────────────────────────────────────────┤
│  1  import { Header } from './components/Header'     │
│  2+ import { DarkModeToggle } from './components/... │
│  3                                                    │
│  4  function App() {                                 │
│  5    return (                                        │
│  6      <div className="app">                        │
│  7+       <DarkModeToggle />                         │
│  8        <Header />                                 │
│  9        <main>                                     │
│ 10          {/* content */}                          │
│ 11        </main>                                    │
│ 12      </div>                                       │
│ 13    )                                              │
│ 14  }                                                │
│                                                       │
│ [Previous File] [Next File]                          │
└──────────────────────────────────────────────────────┘
```

---

### F5: Settings & Configuration

#### F5.1: Anthropic API Key
**Description:** Configure Anthropic API credentials.

**User Story:**
> As a developer, I want to enter my Anthropic API key so that Claude can be used in sessions.

**Acceptance Criteria:**
- [ ] User can navigate to Settings
- [ ] User can enter Anthropic API key
- [ ] Key is validated on save
- [ ] Key stored encrypted in SQLite
- [ ] Key injected into containers automatically
- [ ] User can update or remove key

**UI Mockup:**
```
┌─────────────────────────────────────────┐
│ Settings                                 │
├─────────────────────────────────────────┤
│ Anthropic API Key:                      │
│ [sk-ant-api03-••••••••••••••••] 🔒     │
│                                          │
│ ☑ Use OAuth instead (coming soon)       │
│                                          │
│ [Test Connection]          [Save] ✓     │
└─────────────────────────────────────────┘
```

**Technical Notes:**
- Encrypt with OS keychain (tauri-plugin-keyring)
- Validate by testing API call
- Inject as `/home/claude/.claude/.credentials.json` in containers

---

#### F5.2: Docker Settings
**Description:** Configure Docker-related settings.

**User Story:**
> As a developer, I want to configure Docker settings so that I can optimize resource usage.

**Acceptance Criteria:**
- [ ] User can set container CPU limit (default: 1 core)
- [ ] User can set container memory limit (default: 2GB)
- [ ] User can set max concurrent sessions (default: 5)
- [ ] Settings saved to database
- [ ] Settings applied to new containers

**UI Mockup:**
```
┌─────────────────────────────────────────┐
│ Docker Settings                          │
├─────────────────────────────────────────┤
│ CPU per container:                      │
│ [1.0 cores ▼]                           │
│                                          │
│ Memory per container:                   │
│ [2 GB ▼]                                │
│                                          │
│ Max concurrent sessions:                │
│ [5 ▼]                                   │
│                                          │
│ [Reset to Defaults]        [Save] ✓    │
└─────────────────────────────────────────┘
```

---

#### F5.3: Repository Settings
**Description:** Configure default repository settings.

**User Story:**
> As a developer, I want to set default repository preferences so that I don't have to enter them every time.

**Acceptance Criteria:**
- [ ] User can set default repository path
- [ ] User can set default base branch
- [ ] Settings pre-fill in "New Session" dialog
- [ ] User can override per session

---

### F6: Status & Notifications

#### F6.1: Session Status Indicators
**Description:** Show real-time status of sessions.

**Status Types:**
- 🔵 **Creating** - Container being created
- 🟡 **Cloning** - Repository being cloned
- 🟢 **Ready** - Waiting for user input
- 🟢 **Running** - Claude is working
- ⚪ **Idle** - No activity for > 5 minutes
- 🟢 **Synced** - Currently synced to local
- ✅ **Completed** - Changes applied and committed
- 🔴 **Error** - Something went wrong

**Acceptance Criteria:**
- [ ] Each session shows status badge
- [ ] Status updates in real-time
- [ ] User can see what Claude is doing
- [ ] Errors are clearly displayed

---

#### F6.2: Sync State Indicator
**Description:** Global indicator showing which session is synced.

**UI Mockup:**
```
┌─────────────────────────────────────────────┐
│ 🟢 Session "Add Dark Mode" is synced       │
│    Test at: localhost:3000                  │
│    [Unsync]                                 │
└─────────────────────────────────────────────┘
```

---

#### F6.3: Error Notifications
**Description:** Show errors with actionable messages.

**Error Types:**
1. **Docker not available**
2. **Container creation failed**
3. **Git operation failed**
4. **Sync conflict detected**
5. **API key invalid**

**Example:**
```
┌─────────────────────────────────────────┐
│ ⚠️  Error Syncing Session                │
├─────────────────────────────────────────┤
│ Could not apply changes to local repo:  │
│ Merge conflict in src/App.tsx           │
│                                          │
│ [View Conflict] [Cancel Sync]           │
└─────────────────────────────────────────┘
```

---

## Non-Functional Requirements

### Performance
- **Session Creation:** < 5 seconds (with pre-warmed containers: < 3s)
- **Sync Operation:** < 2 seconds
- **UI Responsiveness:** < 100ms for user interactions
- **Container Resource Usage:** ≤ 1 CPU core, ≤ 2GB RAM per session
- **Max Concurrent Sessions:** Support 5+ sessions on 16GB RAM machine

### Reliability
- **Zero Data Loss:** All changes safely stored in containers until user discards
- **Graceful Degradation:** If Docker unavailable, show clear error message
- **Auto-Recovery:** Reconnect to existing containers on app restart
- **Backup:** Local SQLite database backed up automatically

### Security
- **Credential Encryption:** API keys encrypted at rest
- **Container Isolation:** No network access between containers
- **Input Validation:** All user inputs sanitized
- **Safe Git Operations:** Validate all git commands before execution

### Usability
- **Onboarding:** First-time setup wizard for Docker + API key
- **Help Documentation:** Inline tooltips and help docs
- **Error Messages:** Clear, actionable error messages
- **Keyboard Shortcuts:** Support common shortcuts (Cmd+N, Cmd+Enter, etc.)

### Compatibility
- **Operating Systems:** macOS 12+, Windows 10+, Linux (Ubuntu 20.04+)
- **Docker:** Docker Desktop 4.0+
- **Git:** Git 2.30+
- **Screen Sizes:** Optimized for 1280x800 and up

---

## User Flows

### Flow 1: First Time Setup

```
1. User opens Opslane
   ↓
2. Onboarding wizard appears
   - "Welcome to Opslane"
   - Check Docker installed
   - Enter Anthropic API key
   - Optional: GitHub token
   ↓
3. App builds Docker image
   - Shows progress: "Building Claude session image..."
   - Takes ~2 minutes first time
   ↓
4. Setup complete
   - "You're ready to go!"
   - Shows dashboard (empty state)
   ↓
5. User clicks "Create Session"
```

### Flow 2: Create & Test a Feature

```
1. User clicks "New Session"
   ↓
2. Enters details:
   - Name: "Add dark mode"
   - Repo: /projects/my-app
   - Base: main
   ↓
3. Container creates (3 seconds)
   - Status: Creating → Cloning → Ready
   ↓
4. User chats with Claude
   - "Add a dark mode toggle"
   - Claude makes changes
   - Tool animations show progress
   ↓
5. User clicks "Sync to Local"
   - Changes applied to /projects/my-app
   - Hot reload triggers
   ↓
6. User tests at localhost:3000
   - Dark mode works!
   ↓
7. User clicks "Apply & Keep"
   - Enters commit message
   - Changes committed to main
   ↓
8. Done! Session marked completed
```

### Flow 3: Compare Multiple Approaches

```
1. User creates 3 sessions:
   - "Dark mode - approach A"
   - "Dark mode - approach B"
   - "Dark mode - approach C"
   ↓
2. Claude works on all 3 in parallel
   - Each session independent
   ↓
3. User syncs Approach A
   - Tests at localhost:3000
   - "Too complicated"
   ↓
4. User syncs Approach B
   - Tests at localhost:3000
   - "Perfect!"
   ↓
5. User applies Approach B
   - Commits to main
   ↓
6. User discards A and C
   - Containers cleaned up
```

### Flow 4: Iterate on a Bug Fix

```
1. User creates session "Fix login bug"
   ↓
2. Chats with Claude about the bug
   - Claude makes initial fix
   ↓
3. User syncs to local
   - Tests at localhost:3000/login
   - "Still buggy!"
   ↓
4. User unsyncs
   - Returns to clean state
   ↓
5. User continues chatting in session
   - "The validation is still wrong"
   - Claude makes another fix
   ↓
6. User syncs again
   - Tests again
   - "Works now!"
   ↓
7. User applies and keeps
   - Bug fix committed
```

---

## Release Plan

### v1.0 (MVP) - Weeks 1-8

**Core Features:**
- ✅ Session creation and management
- ✅ Chat interface with Claude
- ✅ Sync-to-local workflow
- ✅ Diff viewer
- ✅ Basic settings (API key, Docker config)

**Success Criteria:**
- 10 beta users successfully use product
- Average 3+ sessions per user
- < 5 critical bugs
- 80%+ would recommend

### v1.1 - Weeks 9-10

**Enhancements:**
- Image upload support in chat
- Session templates
- Better error messages
- Performance optimizations

### v1.2 - Weeks 11-12

**Polish:**
- Keyboard shortcuts
- Improved UI/UX based on feedback
- Auto-update mechanism
- Crash reporting

---

## v2.0 Features (Future)

### Planned Features:
1. **Worktree Mode:** Alternative to Docker for lightweight sessions
2. **Parallel Testing View:** Split-screen iframe comparison
3. **Conflict Resolution:** AI-assisted merge conflict resolution
4. **Session Sharing:** Export/import sessions
5. **Team Features:** Shared sessions across team members

### v3.0 Features (Future)

1. **Modal/Cloud Mode:** Run sessions in cloud
2. **IDE Integration:** VS Code and JetBrains plugins
3. **Multi-Repo Support:** Work across multiple repositories
4. **Advanced Analytics:** Session metrics and insights

---

## Technical Constraints

### Hard Requirements
- Docker Desktop must be installed
- Git 2.30+ required
- 8GB+ RAM recommended (16GB for 5+ sessions)
- Anthropic API key required

### Limitations
- One session synced to local at a time
- Sequential testing (can't test multiple sessions simultaneously in v1)
- Local execution only (no cloud in v1)
- Single user per machine

---

## Open Questions

1. **Container Persistence:** Should containers persist after app restart?
   - Option A: Keep containers (resume sessions)
   - Option B: Clean up on exit (fresh start)
   - **Decision:** Keep containers, allow manual cleanup

2. **Dependency Management:** How to handle node_modules/venv in containers?
   - Option A: Install in each container (slow, isolated)
   - Option B: Share read-only volume (fast, potential conflicts)
   - **Decision:** Start with A, optimize to B later

3. **Sync Conflicts:** What if applying patch causes merge conflicts?
   - Option A: Show error, let user resolve manually
   - Option B: Use Claude to auto-resolve
   - **Decision:** A for v1, B for v2

4. **Session Limits:** Hard limit on concurrent sessions?
   - **Decision:** Warn at 5, hard limit at 10

---

## Risks & Mitigations

### Risk 1: Docker Not Installed
**Impact:** High - Product unusable
**Probability:** Medium - Some users may not have Docker
**Mitigation:**
- Clear error message with install link
- Future: Add worktree mode (no Docker required)

### Risk 2: Large Repositories
**Impact:** Medium - Slow container creation
**Probability:** Medium - Enterprise repos can be huge
**Mitigation:**
- Use shallow clones (--depth 1)
- Show progress during cloning
- Allow cancellation

### Risk 3: Resource Exhaustion
**Impact:** High - Machine becomes unresponsive
**Probability:** Low - Users may create too many sessions
**Mitigation:**
- Hard limits on containers
- Resource monitoring
- Auto-pause idle sessions

### Risk 4: Data Loss
**Impact:** Critical - User loses work
**Probability:** Very Low - Bugs in sync/apply logic
**Mitigation:**
- Always stash before sync
- Never destructive operations without confirmation
- Keep containers until user explicitly discards
- Auto-backup SQLite database

---

## Success Metrics

### Usage Metrics
- **Daily Active Users (DAU)**
- **Average sessions per user per day**
- **Sync operations per session**
- **Session completion rate** (applied vs. discarded)

### Performance Metrics
- **P50 session creation time**
- **P95 sync operation time**
- **Container resource usage**
- **Crash rate**

### User Satisfaction
- **NPS Score:** Target 50+
- **Feature requests:** Top 5 tracked
- **Bug reports:** < 10 critical per release
- **User testimonials:** Collect qualitative feedback

---

## Appendix

### Glossary

- **Session:** An isolated Claude Code conversation in a Docker container
- **Sync:** Apply session changes to local repository temporarily
- **Unsync:** Remove synced changes and restore clean state
- **Apply:** Commit synced changes permanently to local repository
- **Container:** Docker container running Claude Code
- **Base Branch:** Starting branch for a session (usually main)

### References

- [Tauri Documentation](https://tauri.app)
- [Claude Code CLI](https://github.com/anthropics/claude-code)
- [Docker API](https://docs.docker.com/engine/api/)
- [Codient Architecture](../codient) (inspiration)

---

**Document Version:** 1.0
**Last Updated:** 2025-01-14
**Owner:** Product Team
**Stakeholders:** Engineering, Design, Users
