# UX Design Document

## Overview

This document details the user experience design for Opslane, including comprehensive user stories, interaction flows, screen designs, and UX principles. It builds on the PRD and Architecture documents to provide a complete picture of how users will interact with the application.

---

## Table of Contents

1. [UX Principles](#ux-principles)
2. [Information Architecture](#information-architecture)
3. [Detailed User Stories](#detailed-user-stories)
4. [Screen-by-Screen Design](#screen-by-screen-design)
5. [User Flows](#user-flows)
6. [Interaction Patterns](#interaction-patterns)
7. [Accessibility](#accessibility)
8. [Responsive Design](#responsive-design)
9. [Error States](#error-states)
10. [Empty States](#empty-states)
11. [Loading States](#loading-states)
12. [Keyboard Navigation](#keyboard-navigation)

---

## UX Principles

### 1. **Clarity Over Cleverness**
- Show exactly what's happening at all times
- Use clear, simple language
- Avoid technical jargon unless necessary
- Make the current state obvious

### 2. **Safe Experimentation**
- Users should never fear breaking their code
- Always provide undo/cancel options
- Require confirmation for destructive actions
- Show what will happen before it happens

### 3. **Progressive Disclosure**
- Show essential information upfront
- Hide complexity until needed
- Expand details on demand
- Don't overwhelm with options

### 4. **Fast Feedback**
- Instant visual feedback for actions
- Show progress for long operations
- Stream real-time updates
- Never leave user wondering

### 5. **Consistent Patterns**
- Reuse interaction patterns
- Maintain visual consistency
- Keep terminology consistent
- Match user mental models

---

## Information Architecture

### App Structure

```
Opslane Desktop App
├── Dashboard (Home)
│   ├── Sessions Grid
│   ├── Sync State Banner
│   └── Quick Actions
│
├── Session Detail (Modal/Panel)
│   ├── Chat Interface
│   ├── Files Changed Panel
│   └── Session Actions
│
├── Diff Viewer (Modal)
│   ├── File Tree
│   └── Side-by-Side Diff
│
├── Settings
│   ├── API Keys
│   ├── Docker Settings
│   ├── Repository Defaults
│   └── Preferences
│
└── Onboarding (First Run)
    ├── Welcome
    ├── Docker Check
    ├── API Key Setup
    └── Ready to Go
```

### Navigation Model

**Primary Navigation:** Single-screen dashboard with modals for detail views
**Rationale:** Desktop apps work best with focused single-window UX

**Modal Stack:**
```
Dashboard (Base)
  → New Session Dialog
  → Session Chat (Full Screen Modal)
      → Diff Viewer (Overlay)
  → Settings (Panel)
```

---

## Detailed User Stories

### Epic 1: Session Management

#### Story 1.1: Create First Session
**As a** first-time user
**I want to** create my first Claude session
**So that** I can start working on a feature

**Acceptance Criteria:**
- [ ] Click "New Session" shows creation dialog
- [ ] Dialog explains what will happen
- [ ] Repo path has file picker
- [ ] Base branch dropdown shows available branches
- [ ] Shows estimated time (3-5 seconds)
- [ ] Can cancel during creation
- [ ] Success state shows new session card

**UX Details:**
- Pre-fill repo path with last used or common locations
- Show helpful tooltip: "Sessions run in isolated containers"
- Disable "Create" until required fields filled
- Show progress: "Creating container..." → "Cloning repo..." → "Ready!"

---

#### Story 1.2: Identify Session Status at a Glance
**As a** user with multiple sessions
**I want to** quickly understand each session's status
**So that** I can decide which one to work on

**Acceptance Criteria:**
- [ ] Each card shows color-coded status badge
- [ ] Status text is clear and concise
- [ ] Active sessions visually distinct from idle
- [ ] Synced session has prominent indicator
- [ ] Last activity timestamp visible

**UX Details:**
- Use familiar status colors (green = active, yellow = warning, red = error)
- Show relative time: "2 minutes ago" vs "2 days ago"
- Pulse animation on actively running sessions
- Bold border on synced session

---

#### Story 1.3: Delete Unwanted Session
**As a** user
**I want to** safely delete a session I no longer need
**So that** I can free up resources

**Acceptance Criteria:**
- [ ] "Delete" button clearly labeled
- [ ] Confirmation dialog explains consequences
- [ ] Shows what will be deleted (container, messages, changes)
- [ ] Offers alternative to archive instead
- [ ] Confirms successful deletion

**UX Details:**
- Red "Discard" button for clarity
- Two-step confirmation for synced sessions
- Option to export session before deleting
- Shows resources freed up after deletion

---

### Epic 2: Chat & Collaboration

#### Story 2.1: Natural Conversation with Claude
**As a** developer
**I want to** chat naturally with Claude about my code
**So that** I can explain problems and get solutions

**Acceptance Criteria:**
- [ ] Chat input supports multi-line text
- [ ] Can send with Cmd+Enter
- [ ] Messages appear instantly in history
- [ ] Claude's responses stream character-by-character
- [ ] Tool use shows visual animations
- [ ] Can scroll history while Claude responds

**UX Details:**
- Auto-focus input on session open
- Show typing indicator while waiting
- Syntax highlighting in code blocks
- Copy button on code snippets
- Timestamps on messages (on hover)

---

#### Story 2.2: Understand What Claude is Doing
**As a** user
**I want to** see what tools Claude is using
**So that** I understand what changes are being made

**Acceptance Criteria:**
- [ ] Tool use blocks expand/collapse
- [ ] Show tool name and parameters
- [ ] Animate tools while in progress
- [ ] Show results when complete
- [ ] Group related tool uses

**UX Details:**
- Icons for each tool type (📝 Write, ✏️ Edit, 🔍 Read, etc.)
- Progress spinner on active tools
- Green checkmark on completed tools
- Click to expand and see full details
- Diff preview for file edits

---

#### Story 2.3: Resume Session After Restart
**As a** user
**I want to** see my full chat history when reopening a session
**So that** I don't lose context

**Acceptance Criteria:**
- [ ] All messages loaded on session open
- [ ] Scroll position at most recent message
- [ ] Can scroll up to see history
- [ ] Virtual scrolling for long histories
- [ ] Search within conversation (future)

**UX Details:**
- Show loading skeleton while fetching
- "Load more" for conversations >100 messages
- Anchor to latest message with smooth scroll
- Highlight search matches (future)

---

### Epic 3: Sync-to-Local Workflow

#### Story 3.1: Preview Changes Before Syncing
**As a** careful developer
**I want to** see what changes will be applied
**So that** I can verify before syncing

**Acceptance Criteria:**
- [ ] "View Changes" shows file list
- [ ] Click file to see diff
- [ ] Shows additions/deletions count
- [ ] Can sync directly from preview
- [ ] Can close without syncing

**UX Details:**
- Modal with file tree on left, diff on right
- Expandable folders in file tree
- Syntax-highlighted diff viewer
- "Sync to Local" button in preview
- ESC to close

---

#### Story 3.2: Safely Sync Session
**As a** developer
**I want to** apply session changes to my local repo
**So that** I can test with my dev servers

**Acceptance Criteria:**
- [ ] Warns if another session synced
- [ ] Warns if uncommitted local changes
- [ ] Shows what will happen
- [ ] Confirms after successful sync
- [ ] Updates UI to show synced state

**UX Details:**
- Clear warning dialogs with action buttons
- "Switch Sessions" vs "Cancel"
- Progress indicator during sync
- Toast notification: "✓ Synced to local - Test at localhost:3000"
- Synced banner appears at top

---

#### Story 3.3: Test and Iterate
**As a** developer
**I want to** test synced changes and return to clean state
**So that** I can try different approaches

**Acceptance Criteria:**
- [ ] Synced banner shows which session is active
- [ ] "Unsync" button easily accessible
- [ ] Unsync returns to clean state instantly
- [ ] Can sync different session after unsync
- [ ] Never lose work in container

**UX Details:**
- Persistent banner: "🟢 'Add Dark Mode' synced"
- Single-click unsync (with undo toast)
- Visual feedback when local state changes
- Breadcrumb: Session → Local → Back to Session

---

#### Story 3.4: Commit Good Changes
**As a** satisfied developer
**I want to** permanently apply the changes
**So that** I can push to my repository

**Acceptance Criteria:**
- [ ] "Apply & Keep" button visible when synced
- [ ] Shows commit message dialog
- [ ] Pre-fills with session name
- [ ] Allows editing commit message
- [ ] Confirms successful commit
- [ ] Marks session as completed

**UX Details:**
- Green "Apply & Keep" button
- Commit dialog with textarea
- Shows files to be committed (summary)
- Option to push immediately (future)
- Success: "✓ Committed to main - Session completed"

---

### Epic 4: Diff & Code Review

#### Story 4.1: Quick File Overview
**As a** reviewer
**I want to** see which files changed
**So that** I can understand scope of changes

**Acceptance Criteria:**
- [ ] Shows categorized file list (added, modified, deleted)
- [ ] Shows line counts per file
- [ ] Folders are grouped
- [ ] Can click to see individual diff
- [ ] Updates in real-time as Claude works

**UX Details:**
- Tree structure for nested files
- Color coding: green (added), blue (modified), red (deleted)
- Collapsible folders
- Badge with total file count
- Live updates with subtle animation

---

#### Story 4.2: Review Code Changes
**As a** code reviewer
**I want to** see side-by-side diff
**So that** I can understand exact changes

**Acceptance Criteria:**
- [ ] Syntax highlighting for language
- [ ] Side-by-side or unified view
- [ ] Line numbers on both sides
- [ ] Can copy original or modified code
- [ ] Can navigate between files

**UX Details:**
- Toggle: Side-by-side ↔ Unified
- Theme matches system (light/dark)
- Mini-map for long files
- "Previous File" / "Next File" navigation
- Keyboard shortcuts (J/K for files)

---

### Epic 5: Settings & Configuration

#### Story 5.1: Secure API Key Storage
**As a** security-conscious user
**I want to** safely store my Anthropic API key
**So that** it's encrypted and protected

**Acceptance Criteria:**
- [ ] Key input masked (show/hide toggle)
- [ ] "Test Connection" validates key
- [ ] Encrypts before saving
- [ ] Shows last 4 chars when saved
- [ ] Can update or remove key

**UX Details:**
- Eye icon to toggle visibility
- "Test Connection" shows loading + success/error
- "Saved" confirmation with green checkmark
- Warning before removing key
- Link to get API key from Anthropic

---

#### Story 5.2: Configure Docker Resources
**As a** resource-conscious user
**I want to** limit container resources
**So that** my machine stays responsive

**Acceptance Criteria:**
- [ ] Sliders for CPU and memory
- [ ] Shows current usage per session
- [ ] Warns if limits too low
- [ ] Saves settings immediately
- [ ] Applies to new containers

**UX Details:**
- Visual sliders with numeric input
- Shows total available resources
- Real-time usage chart
- Warning: "Less than 2GB may cause slowness"
- "Reset to Recommended" button

---

## Screen-by-Screen Design

### Screen 1: Dashboard (Home)

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│  Opslane                                    ⚙️ Settings      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐  │
│  │  🟢 Session "Add Dark Mode" is synced to local       │  │
│  │  Test at: localhost:3000          [Unsync] [Apply]   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Sessions (3 active)                      [+ New Session]   │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────┐ │
│  │ 🟢 Add Dark Mode │  │ ⚪ Fix Login Bug │  │ 🟡 API   │ │
│  │ SYNCED           │  │ Ready            │  │ Running  │ │
│  │ session/dark-abc │  │ session/fix-xyz  │  │ sess/api │ │
│  │ 4 files • 2m ago │  │ 3 files • 5m ago │  │ 1 file   │ │
│  │                  │  │                  │  │          │ │
│  │ [Chat] [Diff]    │  │ [Chat] [Sync]    │  │ [Chat]   │ │
│  │ [Apply] [Unsync] │  │ [Diff] [Discard] │  │ [Diff]   │ │
│  └──────────────────┘  └──────────────────┘  └──────────┘ │
│                                                              │
│  Completed (1)                             [Show All ▾]     │
│  ┌──────────────────┐                                       │
│  │ ✅ Auth Refactor │                                       │
│  │ Committed 2d ago │                                       │
│  │ 8 files changed  │                                       │
│  │ [View]           │                                       │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

**Key Elements:**
1. **Top Bar:** App title + Settings button
2. **Sync Banner:** Prominent, dismissible, action buttons
3. **Session Cards:** Grid layout, 3 columns on large screens
4. **Status Indicators:** Color-coded dots (🟢🟡🔴⚪)
5. **Quick Actions:** Buttons based on state

**Interactions:**
- Click card → Open chat
- Hover card → Show more actions
- Drag to reorder (future)
- Right-click → Context menu

---

### Screen 2: New Session Dialog

**Layout:**
```
┌──────────────────────────────────────────┐
│  Create New Session              [✕]     │
├──────────────────────────────────────────┤
│                                          │
│  What are you working on?                │
│  ┌──────────────────────────────────┐   │
│  │ Add dark mode toggle             │   │
│  └──────────────────────────────────┘   │
│                                          │
│  Repository Path                         │
│  ┌──────────────────────────────────┐   │
│  │ /Users/me/projects/my-app    📁  │   │
│  └──────────────────────────────────┘   │
│  💡 Tip: Choose your project root        │
│                                          │
│  Base Branch (optional)                  │
│  ┌──────────────────────────────────┐   │
│  │ main                          ▼  │   │
│  └──────────────────────────────────┘   │
│                                          │
│  ⚡ Creates in ~3 seconds                │
│                                          │
│  [Cancel]              [Create Session]  │
└──────────────────────────────────────────┘
```

**Validation States:**
- Empty name → "Create Session" disabled
- Invalid path → Red border + error message
- Valid form → "Create Session" enabled (blue)

**Loading State:**
```
┌──────────────────────────────────────────┐
│  Creating Session...            [✕]      │
├──────────────────────────────────────────┤
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ 🔵 Creating container              │ │
│  │    ████████░░░░░░░░  50%           │ │
│  └────────────────────────────────────┘ │
│                                          │
│  This usually takes 3-5 seconds          │
│                                          │
│  [Cancel Creation]                       │
└──────────────────────────────────────────┘
```

---

### Screen 3: Chat Interface (Full Screen)

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to Dashboard    Session: Add Dark Mode    [✕] Close │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────┬────────────────────┐  │
│  │                                  │  Files Changed (4) │  │
│  │  You                             │  ┌────────────────┐│  │
│  │  Add a dark mode toggle to the   │  │ M src/App.tsx  ││  │
│  │  header that persists             │  │ M components/  ││  │
│  │                                  │  │   Header.tsx   ││  │
│  │  2:34 PM                         │  │ A components/  ││  │
│  │                                  │  │   DarkMode.tsx ││  │
│  │  ───────────────────────────────  │  │ M tailwind.   ││  │
│  │                                  │  │   config.js    ││  │
│  │  Claude                          │  └────────────────┘│  │
│  │  I'll help you add a dark mode   │                    │  │
│  │  toggle. Let me create a new...  │  [View All Diffs]  │  │
│  │                                  │                    │  │
│  │  ┌─────────────────────────────┐ │  Session Actions   │  │
│  │  │ 📝 Write                    │ │  ┌────────────────┐│  │
│  │  │ src/components/DarkMode.tsx │ │  │ Sync to Local  ││  │
│  │  │ Created component with...   │ │  │ View Changes   ││  │
│  │  │ [View Code]                 │ │  │ Discard        ││  │
│  │  └─────────────────────────────┘ │  └────────────────┘│  │
│  │                                  │                    │  │
│  │  ┌─────────────────────────────┐ │  Status            │  │
│  │  │ ✏️ Edit                     │ │  🟢 Ready          │  │
│  │  │ src/App.tsx                 │ │  Last active:      │  │
│  │  │ Added import and toggle...  │ │  2 minutes ago     │  │
│  │  │ [View Diff]                 │ │                    │  │
│  │  └─────────────────────────────┘ │                    │  │
│  │                                  │                    │  │
│  │  I've added the dark mode toggle │                    │  │
│  │  to your header. The toggle...   │                    │  │
│  │                                  │                    │  │
│  │  2:34 PM                         │                    │  │
│  │                                  │                    │  │
│  ├─────────────────────────────────┤                    │  │
│  │ Message Claude...       [Image]  │                    │  │
│  │                                  │                    │  │
│  │                          [Send →]│                    │  │
│  └─────────────────────────────────┴────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Layout Breakdown:**
- **Left (70%):** Chat messages with tool animations
- **Right (30%):** File changes + session actions sidebar
- **Bottom:** Message input with send button

**Key Features:**
- Auto-scroll to latest message
- Expandable tool blocks
- Real-time file updates in sidebar
- Quick action buttons in sidebar

---

### Screen 4: Diff Viewer Modal

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│  Changes: Add Dark Mode                          [✕] Close  │
├────────────────┬────────────────────────────────────────────┤
│ Files (4)      │ src/App.tsx                    [◧ ◨] ←→   │
│                │                                             │
│ Modified (3)   │ ┌─────────────┬─────────────────────────┐ │
│ › src/         │ │ Before      │ After                   │ │
│   • App.tsx    │ ├─────────────┼─────────────────────────┤ │
│   › components/│ │  1  import  │  1  import { Header }   │ │
│   • Header.tsx │ │     Header  │  2  import { DarkMode } │ │
│                │ │             │  3                      │ │
│ Added (1)      │ │  2          │  4  function App() {    │ │
│ › components/  │ │  3  function│  5    return (          │ │
│   • DarkMode.. │ │     App()   │  6      <div>           │ │
│                │ │             │  7+       <DarkMode />  │ │
│ [Sync to Local]│ │  4    return│  8        <Header />    │ │
│                │ │       <div> │  9        <main>        │ │
│                │ │             │ 10          ...         │ │
│                │ │  5      <Hea│ 11        </main>       │ │
│                │ │         der>│ 12      </div>          │ │
│                │ │             │ 13    )                 │ │
│                │ └─────────────┴─────────────────────────┘ │
│                │                                             │
│                │ [← Prev File]              [Next File →]   │
└────────────────┴─────────────────────────────────────────────┘
```

**Features:**
- File tree on left with expand/collapse
- Side-by-side diff (can toggle to unified)
- Syntax highlighting
- Mini-map for long files (right edge)
- Navigate between files with arrows or J/K keys

---

### Screen 5: Settings Panel

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│  Settings                                        [✕] Close  │
├──────────────┬──────────────────────────────────────────────┤
│ General      │  API Keys                                    │
│ API Keys     │                                              │
│ Docker       │  Anthropic API Key                           │
│ Repository   │  ┌──────────────────────────────────────┐   │
│ Advanced     │  │ sk-ant-api03-••••••••••••••••    👁️ │   │
│              │  └──────────────────────────────────────┘   │
│              │  ✅ Connected • Last verified 2m ago         │
│              │                                              │
│              │  [Test Connection]        [Remove Key]       │
│              │                                              │
│              │  💡 Your key is encrypted and stored locally │
│              │  🔗 Get your API key from console.anthropic  │
│              │                                              │
│              │  ─────────────────────────────────────────   │
│              │                                              │
│              │  GitHub Token (Optional)                     │
│              │  ┌──────────────────────────────────────┐   │
│              │  │ ghp_••••••••••••••••••••••••••   👁️ │   │
│              │  └──────────────────────────────────────┘   │
│              │  For future PR creation features             │
│              │                                              │
│              │  [Add Token]                                 │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

**Tabs:**
1. **General:** App preferences, theme
2. **API Keys:** Anthropic + GitHub tokens
3. **Docker:** Resource limits, container settings
4. **Repository:** Default paths and branches
5. **Advanced:** Debug mode, logs, cache

---

## User Flows

### Flow 1: Complete First-Time Setup

```
┌─────────────┐
│ Open App    │
└──────┬──────┘
       │
       ↓
┌─────────────────────┐
│ Onboarding Wizard   │
│ "Welcome to Opslane"│
└──────┬──────────────┘
       │
       ↓
┌─────────────────────┐
│ Check Docker        │
│ ✅ Docker running   │
│ OR                  │
│ ❌ Install Docker   │
└──────┬──────────────┘
       │
       ↓
┌─────────────────────┐
│ Enter API Key       │
│ [Test Connection]   │
└──────┬──────────────┘
       │
       ↓
┌─────────────────────┐
│ Build Docker Image  │
│ "Setting up... 2m"  │
└──────┬──────────────┘
       │
       ↓
┌─────────────────────┐
│ Ready!              │
│ [Create Session]    │
└─────────────────────┘
```

**Time:** 3-5 minutes (first time only)
**Skippable:** No
**Save Progress:** Yes (can resume if closed)

---

### Flow 2: Create → Chat → Sync → Test → Apply

```
Dashboard
    ↓ [New Session]
┌──────────────────┐
│ Name: Dark Mode  │
│ Repo: ~/project  │
│ [Create]         │
└────────┬─────────┘
         ↓ (3 seconds)
┌──────────────────┐
│ Session Created  │
│ Status: Ready    │
└────────┬─────────┘
         ↓ [Chat]
┌──────────────────┐
│ "Add dark mode"  │
│ [Send]           │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Claude working   │
│ 📝 Write files   │
│ ✏️ Edit files    │
└────────┬─────────┘
         ↓ (30 seconds)
┌──────────────────┐
│ Changes ready    │
│ 4 files changed  │
│ [View Changes]   │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Diff Viewer      │
│ [Sync to Local]  │
└────────┬─────────┘
         ↓ (1 second)
┌──────────────────┐
│ ✓ Synced!        │
│ Test: :3000      │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ User tests in    │
│ browser/terminal │
│ "Looks good!"    │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ [Apply & Keep]   │
│ Commit message   │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ ✓ Committed!     │
│ Session complete │
└──────────────────┘
```

**Total Time:** ~2 minutes
**Success Path:** Happy path shown above
**Alternative Path:** Unsync → Continue chatting → Sync again

---

### Flow 3: Compare Three Approaches

```
Dashboard
    ↓
Create 3 sessions:
├─ "Dark Mode A" (CSS variables)
├─ "Dark Mode B" (Tailwind classes)
└─ "Dark Mode C" (Styled components)
    ↓
All 3 run in parallel
    ↓
┌──────────────────┐
│ Sync "A" to test │
│ → Don't like it  │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ [Unsync]         │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Sync "B" to test │
│ → Perfect!       │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ [Apply & Keep B] │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ [Discard A]      │
│ [Discard C]      │
└──────────────────┘
```

**Value Prop:** Try multiple approaches without git complexity
**Time Saved:** vs manual git worktrees: 10+ minutes

---

## Interaction Patterns

### Pattern 1: Progressive Sync Confirmation

**Scenario:** User clicks "Sync to Local" when another session is already synced

**Flow:**
1. User clicks "Sync to Local" on Session B
2. System detects Session A is synced
3. Show dialog:
   ```
   ┌──────────────────────────────────────┐
   │ Switch Synced Session?               │
   ├──────────────────────────────────────┤
   │ Current: "Add Dark Mode" (Session A) │
   │ New: "Fix Login" (Session B)         │
   │                                      │
   │ This will:                           │
   │ 1. Remove Session A changes          │
   │ 2. Apply Session B changes           │
   │                                      │
   │ Session A remains safe in container  │
   │                                      │
   │ [Cancel]              [Switch] →    │
   └──────────────────────────────────────┘
   ```
4. User clicks "Switch"
5. Show progress: "Unsyncing Session A..." → "Syncing Session B..."
6. Toast: "✓ Session B synced to local"

**Rationale:** Clear communication prevents confusion and data loss fears

---

### Pattern 2: Contextual Actions

**Principle:** Show only relevant actions based on session state

**Session States & Actions:**

| State | Available Actions | Hidden Actions |
|-------|------------------|----------------|
| Creating | Cancel | All others |
| Ready | Chat, View Changes, Sync, Discard | Unsync, Apply |
| Synced | Chat, View Changes, Unsync, Apply | Sync, Discard |
| Completed | View, Re-open | Chat, Sync, Discard |
| Error | Retry, Delete | Chat, Sync |

**Visual Design:**
- Primary action: Blue button (e.g., "Chat")
- Secondary: Gray button (e.g., "View Changes")
- Destructive: Red button (e.g., "Discard")
- Success: Green button (e.g., "Apply")

---

### Pattern 3: Optimistic UI Updates

**Examples:**

1. **Sending Message:**
   - Message appears instantly in gray
   - Sends to backend
   - Turns black when confirmed
   - Shows retry button if failed

2. **Syncing Session:**
   - UI updates to "Synced" immediately
   - Background: perform git operations
   - Rollback if error + show toast

3. **Deleting Session:**
   - Card fades out immediately
   - Undo toast appears for 5 seconds
   - Actually deletes after 5s or on app close

**Rationale:** Feels fast, maintains user flow

---

## Accessibility

### Keyboard Navigation

**Global Shortcuts:**
- `Cmd/Ctrl + N` - New Session
- `Cmd/Ctrl + ,` - Settings
- `Cmd/Ctrl + W` - Close modal/panel
- `Cmd/Ctrl + K` - Quick search (future)
- `ESC` - Close modal/cancel

**Chat Shortcuts:**
- `Cmd/Ctrl + Enter` - Send message
- `↑` - Edit last message (future)
- `Cmd/Ctrl + /` - Command palette

**Diff Viewer:**
- `J` - Next file
- `K` - Previous file
- `F` - Toggle full screen
- `U` - Toggle unified/split view

### Screen Reader Support

**ARIA Labels:**
- All buttons have `aria-label`
- Modals have `role="dialog"`
- Status indicators have `aria-live="polite"`
- Loading states announced

**Example:**
```jsx
<button
  aria-label="Sync session 'Add Dark Mode' to local repository"
  onClick={handleSync}
>
  Sync to Local
</button>
```

### Focus Management

- Focus trap in modals
- Return focus on modal close
- Visible focus indicators
- Tab order follows visual order

### Color Contrast

- WCAG AAA compliance
- Status colors work in light/dark mode
- Colorblind-friendly palette
- Icons + text (not color alone)

---

## Responsive Design

### Breakpoints

- **Large:** 1280px+ (3-column grid)
- **Medium:** 768px-1279px (2-column grid)
- **Small:** <768px (1-column stack)

### Adaptations

**Dashboard:**
- Large: 3 columns of session cards
- Medium: 2 columns
- Small: 1 column, full width

**Chat Interface:**
- Large: Chat (70%) + Sidebar (30%)
- Medium: Chat (100%), sidebar in drawer
- Small: Chat full screen, sidebar as bottom sheet

**Diff Viewer:**
- Large: Side-by-side diff
- Medium: Side-by-side (narrow columns)
- Small: Unified diff only

---

## Error States

### Error 1: Docker Not Running

```
┌─────────────────────────────────────────┐
│ ⚠️  Docker Not Available                │
├─────────────────────────────────────────┤
│ Opslane needs Docker to run sessions.   │
│                                          │
│ Please:                                 │
│ 1. Install Docker Desktop               │
│ 2. Start Docker                         │
│ 3. Restart Opslane                      │
│                                          │
│ [Install Docker] [Retry]                │
└─────────────────────────────────────────┘
```

---

### Error 2: Container Creation Failed

```
┌─────────────────────────────────────────┐
│ ❌ Session Creation Failed              │
├─────────────────────────────────────────┤
│ Could not create container for:         │
│ "Add Dark Mode"                         │
│                                          │
│ Error: Image build failed               │
│                                          │
│ [View Logs] [Try Again] [Cancel]        │
└─────────────────────────────────────────┘
```

---

### Error 3: Sync Conflict

```
┌─────────────────────────────────────────┐
│ ⚠️  Sync Conflict Detected              │
├─────────────────────────────────────────┤
│ Cannot apply changes to:                │
│ • src/App.tsx                           │
│                                          │
│ Your local file has been modified.      │
│                                          │
│ Options:                                │
│ 1. Commit your local changes first      │
│ 2. Stash and sync anyway                │
│ 3. View differences                     │
│                                          │
│ [Commit] [Stash & Sync] [View Diff]     │
└─────────────────────────────────────────┘
```

---

### Error 4: Invalid API Key

```
┌─────────────────────────────────────────┐
│ ❌ Invalid API Key                      │
├─────────────────────────────────────────┤
│ Could not authenticate with Anthropic.  │
│                                          │
│ Please check:                           │
│ • Key starts with "sk-ant-api03-"       │
│ • No extra spaces                       │
│ • Key is not expired                    │
│                                          │
│ [Update Key] [Get Help]                 │
└─────────────────────────────────────────┘
```

---

## Empty States

### Empty State 1: No Sessions Yet

```
┌─────────────────────────────────────────┐
│                                          │
│           📦                             │
│                                          │
│     No Sessions Yet                      │
│                                          │
│  Create your first Claude session       │
│  to start working on a feature          │
│                                          │
│         [+ New Session]                  │
│                                          │
│     or watch a quick tutorial           │
│         [▶ Watch Video]                  │
│                                          │
└─────────────────────────────────────────┘
```

---

### Empty State 2: No Messages in Session

```
┌─────────────────────────────────────────┐
│                                          │
│           💬                             │
│                                          │
│    Start a conversation                  │
│                                          │
│  Ask Claude to help with your code:      │
│                                          │
│  Examples:                               │
│  • "Add user authentication"             │
│  • "Fix the login bug"                   │
│  • "Refactor the API layer"              │
│                                          │
└─────────────────────────────────────────┘
```

---

### Empty State 3: No Changes Yet

```
┌─────────────────────────────────────────┐
│           📝                             │
│                                          │
│    No changes yet                        │
│                                          │
│  Chat with Claude to make code changes   │
│                                          │
└─────────────────────────────────────────┘
```

---

## Loading States

### Loading 1: Creating Session

```
┌─────────────────────────────────────────┐
│  Creating Session...                     │
├─────────────────────────────────────────┤
│                                          │
│  ⏳ Creating container...                │
│     ████████████████░░░░░░  65%         │
│                                          │
│  Usually takes 3-5 seconds               │
│                                          │
│  [Cancel]                                │
└─────────────────────────────────────────┘
```

---

### Loading 2: Claude Thinking

```
┌─────────────────────────────────────────┐
│  Claude                                  │
│  ⏳ Thinking...                          │
│                                          │
│  [Animated dots or spinner]              │
└─────────────────────────────────────────┘
```

---

### Loading 3: Syncing to Local

```
┌─────────────────────────────────────────┐
│  ⏳ Syncing to local...                  │
│                                          │
│  • Generating patch ✓                   │
│  • Applying changes...                  │
│  • Updating workspace                   │
└─────────────────────────────────────────┘
```

**Duration:** <2 seconds typically

---

### Loading 4: Initial Load

```
┌─────────────────────────────────────────┐
│                                          │
│  ┌──────────┐  ┌──────────┐            │
│  │ ████░░░░ │  │ ████░░░░ │  [Skeleton]│
│  │ ██░░░░░░ │  │ ██░░░░░░ │            │
│  │ ░░░░░░░░ │  │ ░░░░░░░░ │            │
│  └──────────┘  └──────────┘            │
│                                          │
└─────────────────────────────────────────┘
```

**Type:** Skeleton screens for session cards

---

## Keyboard Navigation

### Tab Order

**Dashboard:**
1. Settings button
2. New Session button
3. First session card
4. Session actions (Chat, Sync, etc.)
5. Next session card
6. ...

**Chat Interface:**
1. Back button
2. Message input
3. Send button
4. Scroll to read history (↑↓)
5. Sidebar actions

**Modals:**
1. Modal content (form fields)
2. Primary action button
3. Secondary/Cancel button
4. Close (X) button

### Focus Indicators

```css
/* Custom focus style */
*:focus {
  outline: 2px solid #3B82F6;
  outline-offset: 2px;
  border-radius: 4px;
}
```

---

## Design Tokens

### Colors

**Light Mode:**
- Background: `#FFFFFF`
- Surface: `#F9FAFB`
- Border: `#E5E7EB`
- Text Primary: `#111827`
- Text Secondary: `#6B7280`
- Primary: `#3B82F6`
- Success: `#10B981`
- Warning: `#F59E0B`
- Error: `#EF4444`

**Dark Mode:**
- Background: `#0F172A`
- Surface: `#1E293B`
- Border: `#334155`
- Text Primary: `#F1F5F9`
- Text Secondary: `#94A3B8`
- Primary: `#60A5FA`
- Success: `#34D399`
- Warning: `#FBBF24`
- Error: `#F87171`

### Typography

```css
/* Font Stack */
font-family: -apple-system, BlinkMacSystemFont,
  'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;

/* Sizes */
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
--text-xl: 1.25rem;    /* 20px */
--text-2xl: 1.5rem;    /* 24px */
```

### Spacing

```css
--spacing-1: 0.25rem;  /* 4px */
--spacing-2: 0.5rem;   /* 8px */
--spacing-3: 0.75rem;  /* 12px */
--spacing-4: 1rem;     /* 16px */
--spacing-6: 1.5rem;   /* 24px */
--spacing-8: 2rem;     /* 32px */
```

### Shadows

```css
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
```

---

## Animation & Motion

### Principles

1. **Purposeful:** Every animation serves a function
2. **Fast:** 150-300ms for most transitions
3. **Natural:** Ease-out for entrances, ease-in for exits
4. **Respectful:** Respect `prefers-reduced-motion`

### Common Animations

**Modal Enter:**
```css
@keyframes modal-enter {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
/* Duration: 200ms */
```

**Toast Notification:**
```css
@keyframes toast-slide {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}
/* Duration: 300ms */
```

**Pulse (Active Session):**
```css
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}
/* Duration: 2s, infinite */
```

---

## Micro-interactions

### Session Card Hover

```
Normal State:
┌─────────────────┐
│ 🟢 Dark Mode    │
│ Ready           │
└─────────────────┘

Hover State:
┌─────────────────┐
│ 🟢 Dark Mode    │ ← Slight lift
│ Ready           │ ← Shadow increases
│                 │
│ [Quick Actions] │ ← Appears on hover
└─────────────────┘
```

### Button States

```
Normal:    [Sync to Local]
Hover:     [Sync to Local] ← Darker background
Active:    [Sync to Local] ← Pressed down
Loading:   [⏳ Syncing...]  ← Spinner + text change
Success:   [✓ Synced]      ← Check + green (500ms)
```

### Copy to Clipboard

```
Code Block:
┌──────────────────────┐
│ const foo = 'bar'    │ [📋] ← Copy button
└──────────────────────┘

After Click:
┌──────────────────────┐
│ const foo = 'bar'    │ [✓]  ← Check (1s)
└──────────────────────┘

Toast: "Copied to clipboard"
```

---

## Success Metrics

### UX KPIs

1. **Time to First Session:** <2 minutes from app open
2. **Session Creation Success Rate:** >95%
3. **Sync Success Rate:** >98%
4. **Error Recovery Rate:** >80% (users successfully recover)
5. **NPS Score:** >40 (good), >70 (excellent)

### Usability Testing

**Tasks to Test:**
1. Create a new session (measure time + success)
2. Send a message to Claude (measure confusion)
3. Sync changes to local (measure confidence)
4. View diff before syncing (measure understanding)
5. Apply changes and complete session (measure satisfaction)

**Target Results:**
- Task completion: >90%
- Time on task: Within 2x of expert user
- Errors: <1 per task
- Satisfaction: >4/5 stars

---

## Future Enhancements

### Phase 2 UX Improvements

1. **Search & Filter Sessions**
   - Search by name, files changed
   - Filter by status, date
   - Sort by recent, name, files

2. **Session Templates**
   - Pre-configured session types
   - "Bug Fix", "New Feature", "Refactor"
   - Auto-populate with helpful prompts

3. **Parallel Preview**
   - Split-screen iframe view
   - Test multiple sessions side-by-side
   - Not synced, just preview

4. **Drag & Drop**
   - Drag files into chat to discuss
   - Drag to reorder sessions
   - Drag session to "Apply" zone

5. **Command Palette**
   - `Cmd+K` quick actions
   - Type to search/execute
   - Keyboard-first workflow

---

## Appendix

### User Testing Script

**Intro:**
"You're testing Opslane, a tool for managing multiple Claude coding sessions. Think aloud as you complete these tasks."

**Task 1: Setup**
"Open the app and set up your API key."
- Observe: Do they find settings easily?
- Note: Confusion points

**Task 2: Create Session**
"Create a new session called 'Add Dark Mode' for your project."
- Observe: Form completion time
- Note: Any field confusion

**Task 3: Chat & Review**
"Ask Claude to add a dark mode toggle, then review the changes."
- Observe: Chat interaction
- Note: Do they find "View Changes"?

**Task 4: Sync & Test**
"Sync the changes to your local project to test them."
- Observe: Confidence level
- Note: Understanding of sync concept

**Task 5: Apply**
"You're happy with the changes. Keep them permanently."
- Observe: Finding "Apply" button
- Note: Understanding of commit

**Debrief Questions:**
1. What was confusing?
2. What felt natural?
3. Would you use this daily?
4. What's missing?

---

### Design Checklist

Before shipping a new screen:

- [ ] All states designed (normal, hover, active, disabled, loading, error, empty, success)
- [ ] Responsive layout (large, medium, small)
- [ ] Dark mode styles
- [ ] Keyboard navigation works
- [ ] Screen reader tested
- [ ] Error messages clear and actionable
- [ ] Loading states don't block user
- [ ] Animations respect `prefers-reduced-motion`
- [ ] Copy reviewed for clarity
- [ ] Tooltips added for complex features
- [ ] Consistent with design system
- [ ] User tested (5+ users)

---

**Document Version:** 1.0
**Last Updated:** 2025-01-14
**Owner:** UX Team
**Stakeholders:** Product, Engineering, Users
