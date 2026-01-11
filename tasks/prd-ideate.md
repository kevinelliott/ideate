# PRD: Ideate - AI-Powered App Development Platform

## Introduction

Ideate is a native macOS application built with Tauri that transforms user ideas into complete applications and websites. Users describe their vision, and Ideate generates a structured PRD using Ralph, allows refinement of user stories, then orchestrates AI coding agents to build the project story-by-story. The app features an Apple-inspired design with real-time streaming logs, multi-project management, and a plugin architecture supporting any CLI-based coding agent.

## Goals

- Enable non-technical and technical users to turn ideas into working software
- Provide a beautiful, Apple-native experience for managing AI-assisted development
- Support multiple concurrent projects with independent agent orchestration
- Offer a plugin-based agent system supporting Claude Code, Amp, OpenCode, Crush, and future agents
- Deliver real-time visibility into agent activity via streaming terminal output
- Allow configurable autonomy levels for the build loop (fully autonomous to manual)

## User Stories

### US-001: Project Creation from Idea
**Description:** As a user, I want to create a new project by describing my idea so that Ideate can begin generating a PRD.

**Acceptance Criteria:**
- [ ] "New Project" button in sidebar opens project creation modal
- [ ] User enters project name and idea description (multi-line text)
- [ ] User selects project directory location via native file picker
- [ ] Project folder is created with `.ideate/` subdirectory for metadata
- [ ] Project appears in sidebar immediately after creation
- [ ] Cargo/Tauri build passes

---

### US-002: PRD Generation via Ralph Agent
**Description:** As a user, I want Ideate to generate a PRD from my idea using an AI agent so that I have structured user stories to review.

**Acceptance Criteria:**
- [ ] After project creation, PRD generation starts automatically
- [ ] Agent runs Ralph-style PRD generation using selected agent CLI
- [ ] Generated PRD saved to `<project>/.ideate/prd.json` (Ralph format)
- [ ] Loading spinner shown during generation with streaming status
- [ ] PRD displayed in story list view upon completion
- [ ] Errors shown with retry option

---

### US-003: View User Stories from PRD
**Description:** As a user, I want to see all user stories from my PRD in a clean list so that I can understand the scope.

**Acceptance Criteria:**
- [ ] Stories displayed as cards in main content area
- [ ] Each card shows: story ID, title, description, acceptance criteria count
- [ ] Stories ordered by dependency/priority
- [ ] Status badge on each story (pending/in-progress/complete/failed)
- [ ] Click story card to expand full details
- [ ] Cargo/Tauri build passes

---

### US-004: Edit User Story
**Description:** As a user, I want to edit a user story's title, description, and acceptance criteria so that I can refine the PRD.

**Acceptance Criteria:**
- [ ] Edit button on story card opens edit modal
- [ ] Editable fields: title, description, acceptance criteria (add/remove/edit)
- [ ] Save button persists changes to `prd.json`
- [ ] Cancel button discards changes
- [ ] Unsaved changes warning if closing with edits
- [ ] Cargo/Tauri build passes

---

### US-005: Delete User Story
**Description:** As a user, I want to delete a user story so that I can remove unnecessary scope.

**Acceptance Criteria:**
- [ ] Delete button on story card (trash icon)
- [ ] Confirmation dialog before deletion
- [ ] Story removed from `prd.json` upon confirmation
- [ ] Story list updates immediately
- [ ] Undo option available for 5 seconds after deletion
- [ ] Cargo/Tauri build passes

---

### US-006: Add New User Story
**Description:** As a user, I want to add a new user story to the PRD so that I can expand scope as needed.

**Acceptance Criteria:**
- [ ] "Add Story" button at bottom of story list
- [ ] Opens story creation form (title, description, acceptance criteria)
- [ ] Auto-generates next story ID (US-XXX)
- [ ] New story appended to `prd.json`
- [ ] New story appears in list immediately
- [ ] Cargo/Tauri build passes

---

### US-007: Refine PRD via Agent Chat
**Description:** As a user, I want to chat with an AI agent to refine my PRD so that I can make high-level changes through conversation.

**Acceptance Criteria:**
- [ ] "Refine with AI" button opens chat panel
- [ ] Chat interface for conversing with agent about PRD changes
- [ ] Agent can add/modify/remove stories based on conversation
- [ ] Changes preview shown before applying
- [ ] User confirms or rejects proposed changes
- [ ] Applied changes persist to `prd.json`
- [ ] Cargo/Tauri build passes

---

### US-008: Approve PRD for Build
**Description:** As a user, I want to approve my PRD so that the build phase can begin.

**Acceptance Criteria:**
- [ ] "Approve & Build" button visible when PRD has at least one story
- [ ] Confirmation dialog summarizing story count and estimated scope
- [ ] PRD marked as approved in project state
- [ ] Transitions project to build phase
- [ ] Approved PRD becomes read-only (edits require re-approval)
- [ ] Cargo/Tauri build passes

---

### US-009: Configure Autonomy Level
**Description:** As a user, I want to set the autonomy level for the build loop so that I control how much intervention is needed.

**Acceptance Criteria:**
- [ ] Autonomy selector in project settings (dropdown or segmented control)
- [ ] Options: Fully Autonomous | Pause Between Stories | Manual Per Story
- [ ] Setting persisted per-project in `.ideate/config.json`
- [ ] Default is "Pause Between Stories"
- [ ] Autonomy can be changed mid-build (takes effect on next story)
- [ ] Cargo/Tauri build passes

---

### US-010: Build Loop Execution
**Description:** As a user, I want Ideate to build my project story-by-story using AI agents so that my idea becomes working software.

**Acceptance Criteria:**
- [ ] Build starts from first uncompleted story
- [ ] Agent spawned for current story with story context as prompt
- [ ] Story status updates to "in-progress" during build
- [ ] On story completion: status → "complete", move to next (per autonomy)
- [ ] On story failure: status → "failed", pause for user intervention
- [ ] Build loop respects configured autonomy level
- [ ] Cargo/Tauri build passes

---

### US-011: Real-time Streaming Agent Logs
**Description:** As a user, I want to see real-time streaming output from agents so that I can monitor progress and debug issues.

**Acceptance Criteria:**
- [ ] Terminal-style log panel for each running agent
- [ ] Output streams in real-time (stdout and stderr)
- [ ] ANSI color codes rendered correctly
- [ ] Auto-scroll to bottom with manual scroll override
- [ ] Log buffer limited to last 10,000 lines (configurable)
- [ ] Copy log selection to clipboard
- [ ] Cargo/Tauri build passes

---

### US-012: Agent Status Dashboard
**Description:** As a user, I want to see the status of all agents across all projects so that I have a quick overview.

**Acceptance Criteria:**
- [ ] Dashboard view accessible from sidebar
- [ ] Shows all projects with running agents
- [ ] Per-agent status: running (with duration), idle, error
- [ ] Click agent row to jump to project and view logs
- [ ] Badge count on dashboard icon for active agents
- [ ] Cargo/Tauri build passes

---

### US-013: Multi-Project Management
**Description:** As a user, I want to manage multiple projects in a sidebar so that I can switch between them easily.

**Acceptance Criteria:**
- [ ] Sidebar lists all projects with name and status icon
- [ ] Click project to open it in main view
- [ ] Right-click project for context menu (rename, delete, reveal in Finder)
- [ ] Drag to reorder projects
- [ ] Projects persisted in `~/Library/Application Support/Ideate/projects.json`
- [ ] Cargo/Tauri build passes

---

### US-014: Plugin Architecture for Agents
**Description:** As a developer, I want to add new agent types via plugins so that Ideate can support any CLI-based coding agent.

**Acceptance Criteria:**
- [ ] Plugin defined as JSON manifest + optional script
- [ ] Manifest specifies: name, CLI command, args template, working dir behavior
- [ ] Built-in plugins for: Claude Code, Amp, OpenCode, Crush
- [ ] User plugins stored in `~/.ideate/plugins/`
- [ ] Plugin manager UI to enable/disable/configure plugins
- [ ] Cargo/Tauri build passes

---

### US-015: Select Agent for Project
**Description:** As a user, I want to choose which agent to use for my project so that I can use my preferred AI coding tool.

**Acceptance Criteria:**
- [ ] Agent selector dropdown in project settings
- [ ] Lists all enabled plugins
- [ ] Default agent configurable in global preferences
- [ ] Selected agent stored in `.ideate/config.json`
- [ ] Agent can be changed between stories (not mid-story)
- [ ] Cargo/Tauri build passes

---

### US-016: Pause/Resume/Cancel Build
**Description:** As a user, I want to pause, resume, or cancel the build loop so that I have control over execution.

**Acceptance Criteria:**
- [ ] Pause button stops after current story completes
- [ ] Resume button continues from next pending story
- [ ] Cancel button terminates running agent (with SIGTERM, then SIGKILL)
- [ ] Canceled story marked as "canceled", can be retried
- [ ] State persisted so build can resume after app restart
- [ ] Cargo/Tauri build passes

---

### US-017: Retry Failed Story
**Description:** As a user, I want to retry a failed story so that I can attempt it again after making adjustments.

**Acceptance Criteria:**
- [ ] Retry button on failed story card
- [ ] Clears failure state and re-queues story
- [ ] Optionally edit story before retry
- [ ] Previous attempt logs preserved (collapsed)
- [ ] Retry count displayed on story card
- [ ] Cargo/Tauri build passes

---

### US-018: Apple-style Design System
**Description:** As a user, I want Ideate to have a beautiful, Apple-native look and feel so that it feels like a premium macOS app.

**Acceptance Criteria:**
- [ ] Use SF Pro font family and SF Symbols for icons
- [ ] Respect system light/dark mode
- [ ] Native macOS window controls (traffic lights)
- [ ] Sidebar with vibrancy effect
- [ ] Smooth animations (spring physics, 60fps)
- [ ] Consistent spacing using 4px/8px grid
- [ ] Accessibility: VoiceOver support, keyboard navigation
- [ ] Cargo/Tauri build passes

---

### US-019: Global Preferences
**Description:** As a user, I want to configure global app preferences so that Ideate works the way I prefer.

**Acceptance Criteria:**
- [ ] Preferences window (Cmd+,)
- [ ] Settings: default agent, default autonomy, log buffer size, theme override
- [ ] Agent CLI paths configurable (auto-detect with manual override)
- [ ] Settings persisted in `~/Library/Application Support/Ideate/preferences.json`
- [ ] Changes apply immediately without restart
- [ ] Cargo/Tauri build passes

---

### US-020: Project State Persistence
**Description:** As a user, I want my project state to persist across app restarts so that I never lose progress.

**Acceptance Criteria:**
- [ ] Project state saved to `.ideate/state.json` on every change
- [ ] State includes: current story, story statuses, build phase, autonomy setting
- [ ] App restores exact state on reopen
- [ ] Corrupt state file handled gracefully (backup + fresh start option)
- [ ] Cargo/Tauri build passes

---

## Functional Requirements

- FR-1: The app shall be built with Tauri (Rust backend, web frontend)
- FR-2: Projects shall be stored as folders with an `.ideate/` subdirectory containing all metadata
- FR-3: PRDs shall be stored in Ralph-compatible JSON format (`prd.json`)
- FR-4: The plugin system shall support any CLI-based agent via JSON manifest configuration
- FR-5: Agent output shall be captured and streamed in real-time to the UI
- FR-6: The build loop shall support three autonomy modes: autonomous, pause-between, manual
- FR-7: All UI shall follow Apple Human Interface Guidelines
- FR-8: The app shall support macOS 13+ (Ventura and later)

## Non-Goals

- No Windows or Linux support (macOS only for v1)
- No cloud sync or collaboration features
- No built-in code editor (users use their preferred IDE)
- No mobile companion app
- No agent marketplace or plugin store (manual plugin installation only)
- No version control integration (Git operations done outside Ideate)
- No billing or usage tracking for AI agents (users manage their own API keys)

## Design Considerations

- **Framework:** Tauri with React/TypeScript frontend (or SolidJS for performance)
- **Design Language:** Apple HIG-compliant with SF Pro, SF Symbols, vibrancy effects
- **Color Palette:** System semantic colors (accent, label, background)
- **Typography:** SF Pro Display for headings, SF Pro Text for body
- **Iconography:** SF Symbols exclusively
- **Motion:** Spring-based animations, respect Reduce Motion preference
- **Layout:** Sidebar + main content + optional inspector (3-column when needed)

## Technical Considerations

- **Tauri v2** for native macOS integration and performance
- **Frontend:** React 19 with TypeScript, or SolidJS for lighter bundle
- **State Management:** Zustand or Jotai for simple, performant state
- **Styling:** Tailwind CSS with custom Apple-inspired design tokens
- **Process Management:** Rust `tokio::process` for spawning and managing agent CLIs
- **IPC:** Tauri commands for Rust↔JS communication, events for streaming
- **Storage:** JSON files for simplicity (no database dependency)
- **Terminal Rendering:** xterm.js for log display with ANSI support

## Success Metrics

- User can go from idea to running agent in under 2 minutes
- PRD generation completes in under 60 seconds for typical ideas
- Agent log latency < 100ms from process output to UI display
- App cold start time < 1 second
- Zero data loss from unexpected app termination
- 90%+ of user stories completable without manual intervention

## Open Questions

- Should we support multiple agents working on different stories in parallel?
- How should agent authentication (API keys) be managed—per-agent or global keychain?
- Should there be a "preview" mode to see generated code before accepting story completion?
- What happens if a story's implementation conflicts with a previous story?
- Should we integrate with Finder/Quick Look for project file preview?
