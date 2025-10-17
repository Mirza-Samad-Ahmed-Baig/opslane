# Design Principles

## Overview

These principles guide all design and development decisions for Opslane Desktop. They ensure we build a tool that feels native, reliable, and delightful for developers managing Claude Code sessions.

---

## 1. Native First

**Desktop apps should feel native, not like wrapped websites.**

- Use native system dialogs (file picker, confirm dialogs)
- Follow platform conventions (macOS: top menu bar, Windows: hamburger menu)
- Respect system theme (light/dark mode)
- Use native notifications when appropriate
- Support keyboard shortcuts expected on each platform (Cmd+N vs Ctrl+N)

**Examples:**
- Repository path selector uses Tauri's native file picker
- Confirm destructive actions with native alert dialogs
- Sessions auto-switch to dark mode when system does

---

## 2. Instant Feedback

**Every user action should have immediate visual feedback.**

- Button states: hover, active, loading
- Status badges update in real-time (creating ’ ready ’ error)
- Optimistic updates where safe (delete session ’ remove from UI immediately)
- Loading states for operations >200ms
- Progress indicators for long operations (container creation, git clone)

**Examples:**
- "Create Session" button shows spinner while Docker container starts
- Session cards show pulsing dot when status is "cloning"
- Chat messages show "sending..." state before confirmation
- File changes show diff previews immediately on hover

---

## 3. Resilient by Default

**Assume things will fail. Design for recovery, not prevention.**

- Never destructive without confirmation
- Auto-save all user input
- Graceful degradation when Docker/Git unavailable
- Clear error messages with actionable next steps
- Background recovery (restart failed containers)

**Examples:**
- Session creation form autosaves every keystroke
- If Docker daemon stops, show "Docker unavailable" banner with "Reconnect" button
- Delete session dialog: "This will stop the container and remove it. Continue?"
- Network errors: "Failed to sync. Retrying in 5s..." with manual retry button

---

## 4. Transparent State

**Users should always know what's happening under the hood.**

- Surface container status (running, stopped, error)
- Show branch names, commit hashes, container IDs
- Make hidden state visible (what branch is Claude working on?)
- Real-time logs available on demand
- Progress for multi-step operations

**Examples:**
- Session card shows: `Branch: feature-auth-refactor | Container: opslane-session-a3b2c1`
- Sync operation shows: `1/3 Stashing changes... 2/3 Pulling from main... 3/3 Creating branch...`
- Chat interface has "View Container Logs" button that opens terminal output
- Status badge tooltip: "Ready - Container started 5 minutes ago"

---

## 5. Progressive Disclosure

**Show essential info first. Reveal complexity on demand.**

- Dashboard shows session name, status, branch - hide container ID, paths
- Click session card ’ expanded view with full details
- Chat starts simple ’ power users can view tool use, system prompts
- Settings organized in tabs: Basic, Advanced, Experimental

**Examples:**
- Session list: Show name, status dot, last activity
- Session detail view: Add container name, repo path, created timestamp, resource usage
- Chat message: Show text ’ hover ’ reveal timestamp, sequence number
- New Session dialog: 3 required fields visible, "Advanced Options" expands for container config

---

## 6. Keyboard-Driven

**Power users should be able to do everything with keyboard.**

- Global shortcuts: `Cmd+N` new session, `Cmd+K` search sessions, `Cmd+Enter` send message
- Arrow keys navigate session list
- `Esc` closes dialogs
- Tab navigation throughout app
- Shortcuts visible in UI (tooltips, menu items)

**Examples:**
- Hover "New Session" button shows tooltip: "Create Session (N)"
- Chat input: `Enter` sends, `Shift+Enter` newline
- Session list: `j/k` navigate, `Enter` open chat, `Delete` delete
- Search bar: `Cmd+K` focuses search, type to filter, `Enter` opens first result

---

## 7. Contextual Actions

**Show actions where users need them, not in global menus.**

- Session card: hover reveals "Chat", "Sync", "Delete" buttons
- Chat message: hover reveals "Copy", "Retry", "View Raw" icons
- File change: hover reveals "Revert", "Copy Diff", "Open in Editor"
- Empty states have prominent CTAs: "Create Your First Session"

**Examples:**
- Session card shows status badge always, actions on hover (reduces visual noise)
- Chat has inline "Regenerate" button only on assistant messages
- File diff viewer: "Accept Changes" and "Revert" buttons appear at top when changes detected
- When no sessions exist: Large centered "+ New Session" card with helpful subtitle

---

## 8. Predictable Persistence

**Users shouldn't worry about losing work.**

- All state persists to SQLite immediately
- Draft messages survive app restart
- Window size/position remembered
- Last opened session auto-opens on launch
- Background sync every 30s

**Examples:**
- Close app while session is creating ’ restart shows "creating" status, continues
- Type message, close app, reopen ’ draft message still in input
- Chat scroll position preserved per session
- Session list sort order/filters saved

---

## 9. Performance Budget

**Desktop apps should feel instant, even with dozens of sessions.**

- Startup time: <2s (cold start)
- Session list render: <100ms (50 sessions)
- Chat message render: <50ms per message
- Database queries: <10ms (indexed)
- UI interactions: <16ms (60fps)

**Techniques:**
- Virtual scrolling for long message lists
- React Query caching with 5s stale time
- Background container operations (don't block UI)
- SQLite indexes on `session_id`, `status`, `created_at`
- Debounce search input (300ms)

---

## 10. Calm Technology

**The app should stay out of the way until needed.**

- No auto-playing animations
- Subtle state changes (fade in/out, no bouncing)
- Notifications only for critical events (session error, sync conflict)
- Muted color palette (grays + single accent color)
- No "productivity porn" metrics (tasks completed, time saved, etc.)

**Examples:**
- Status dots pulse slowly (not blink rapidly)
- Session creation shows progress bar, not confetti animation
- No notification when session becomes ready (users can see in UI)
- Only notify on error: "Session 'feature-login' failed to start"
- UI uses grays + green accent (green = active/ready)

---

## 11. Escape Hatches

**When the UI can't do something, expose the underlying system.**

- "Open in Terminal" button for every session (opens shell in container)
- "View Container Logs" shows raw Docker output
- "Open Repo in Finder/Explorer" for local paths
- "Copy Docker Command" for manual debugging
- Export session database as JSON

**Examples:**
- Session detail view has "Open in Terminal" ’ launches `docker exec -it <container> bash`
- Chat message with tool use ’ "View Raw JSON" reveals Claude API format
- Sync conflict ’ "Open Git GUI" button launches system git client
- Settings ’ "Export All Sessions" downloads `sessions-backup-2025-01-15.json`

---

## 12. Zero Configuration

**The app should work immediately with sensible defaults.**

- Auto-detect Docker socket path (macOS: `/var/run/docker.sock`, `/Users/<user>/.docker/run/docker.sock`)
- Default base branch: `main` (detect `master` if `main` doesn't exist)
- Auto-generate session names: `session-1`, `session-2`, or random adjective-noun
- Use system Claude Code installation if available
- Settings page only for overrides

**Examples:**
- First launch: "Connecting to Docker..." ’ success ’ show empty sessions list
- Create Session: Only 2 required fields (name autofilled, branch defaults to `main`)
- App automatically uses `/usr/local/bin/claude` if present
- No setup wizard or onboarding screens

---

## Anti-Patterns

**Things we explicitly avoid:**

- L Electron-style web wrappers (use Tauri for native performance)
- L Loading spinners without context ("Loading..." vs "Creating container...")
- L Modal dialogs for non-critical info (use toast notifications)
- L Auto-refresh without debouncing (don't hammer API/DB)
- L Generic error messages ("Something went wrong" vs "Docker daemon not running")
- L Hiding system state (always show what's happening in Docker/Git)
- L Wizard-style flows (multi-step forms with "Next" buttons)
- L Aggressive animations (bouncing, shaking, pulsing rapidly)

---

## Implementation Checklist

When building a new feature, verify:

- [ ] Does it feel native? (system dialogs, platform conventions)
- [ ] Does every action have immediate feedback? (hover states, loading indicators)
- [ ] What happens if this fails? (error handling, retry logic)
- [ ] Can users see what's happening? (status, logs, progress)
- [ ] Is complexity hidden by default? (progressive disclosure)
- [ ] Are keyboard shortcuts available? (and documented in tooltips)
- [ ] Are actions contextual? (near where users need them)
- [ ] Does state persist? (survives app restart)
- [ ] Does it meet performance budget? (measure with profiler)
- [ ] Is it calm? (subtle, muted, not attention-grabbing)
- [ ] Is there an escape hatch? (access underlying system)
- [ ] Does it work with zero config? (sensible defaults)

---

**Document Version:** 1.0
**Last Updated:** 2025-01-15
**Related:** See `specs/milestones.md` for implementation timeline
