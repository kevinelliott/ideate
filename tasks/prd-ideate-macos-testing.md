# PRD: Ideate macOS App Testing

## Introduction

Comprehensive testing suite for the Ideate Tauri-based macOS application to verify that it builds correctly, launches without errors, and all features work as expected. This includes development builds, release builds, DMG packaging, full UI verification, accessibility checks, and real agent integration testing.

## Goals

- Verify development build compiles and runs without errors
- Verify release build compiles and runs without errors
- Verify DMG/installer packaging works correctly
- Test all core UI components render and function properly
- Test project management (create, rename, delete, persist)
- Test story/PRD management (create, edit, delete, persist)
- Test agent settings configuration
- Test agent spawning, output streaming, and termination with real agent (amp/claude)
- Verify keyboard navigation and accessibility
- Ensure no console errors or runtime panics

## User Stories

### US-001: Development Build Verification
**Description:** As a developer, I want to verify the development build compiles and launches so that I know the dev environment is working.

**Acceptance Criteria:**
- [ ] `pnpm install` completes without errors
- [ ] `pnpm tauri dev` compiles Rust backend without errors
- [ ] `pnpm tauri dev` compiles TypeScript frontend without errors
- [ ] Application window opens with correct title "Ideate"
- [ ] No panic or crash on startup
- [ ] Console shows no critical errors

### US-002: Release Build Verification
**Description:** As a developer, I want to verify the release build compiles so that I know production builds work.

**Acceptance Criteria:**
- [ ] `pnpm tauri build` completes without errors
- [ ] Release binary is created in `src-tauri/target/release/`
- [ ] Release binary launches without errors
- [ ] Application window opens correctly
- [ ] No panic or crash on startup

### US-003: DMG Packaging Verification
**Description:** As a developer, I want to verify the DMG installer is created correctly so that the app can be distributed.

**Acceptance Criteria:**
- [ ] DMG file is generated in `src-tauri/target/release/bundle/dmg/`
- [ ] DMG can be mounted on macOS
- [ ] App can be dragged to Applications folder
- [ ] App launches from Applications folder without security warnings (or expected Gatekeeper prompt for unsigned)
- [ ] App icon displays correctly in Finder and Dock

### US-004: Sidebar and Project List UI
**Description:** As a user, I want to see the sidebar with project list so I can navigate between projects.

**Acceptance Criteria:**
- [ ] Sidebar renders on the left side of the window
- [ ] "New Project" button is visible and clickable
- [ ] Project list displays any existing projects
- [ ] Clicking a project selects it and highlights it
- [ ] Selected project shows in main content area
- [ ] Verify in browser using dev-browser skill
- [ ] Check color contrast meets WCAG AA standards

### US-005: Create New Project
**Description:** As a user, I want to create a new project so I can start managing stories.

**Acceptance Criteria:**
- [ ] Clicking "New Project" button opens modal
- [ ] Modal has fields for name, description, and directory picker
- [ ] Directory picker opens native macOS folder dialog
- [ ] Submitting with valid data creates project folder on disk
- [ ] `.ideate/config.json` is created in project folder
- [ ] New project appears in sidebar
- [ ] Modal closes after successful creation
- [ ] Verify in browser using dev-browser skill
- [ ] Tab navigation works through all form fields

### US-006: Rename Project
**Description:** As a user, I want to rename an existing project so I can correct mistakes.

**Acceptance Criteria:**
- [ ] Right-click on project shows context menu
- [ ] "Rename" option is available in context menu
- [ ] Clicking "Rename" opens rename modal
- [ ] Current name is pre-filled in input
- [ ] Submitting updates project name in sidebar
- [ ] Project persists after app restart
- [ ] Verify in browser using dev-browser skill

### US-007: Delete Project
**Description:** As a user, I want to delete a project so I can remove unwanted items.

**Acceptance Criteria:**
- [ ] Right-click on project shows context menu with "Delete" option
- [ ] Clicking "Delete" shows confirmation modal
- [ ] Confirming deletion removes project from sidebar
- [ ] Project no longer appears after app restart
- [ ] Canceling deletion keeps project intact
- [ ] Verify in browser using dev-browser skill

### US-008: Project Persistence
**Description:** As a user, I want my projects to persist across app restarts so I don't lose my work.

**Acceptance Criteria:**
- [ ] Create a new project and close the app
- [ ] Reopen the app
- [ ] Previously created project appears in sidebar
- [ ] `projects.json` exists in app data directory
- [ ] Project data matches what was created

### US-009: Story List Display
**Description:** As a user, I want to see the list of stories for a project so I can track work items.

**Acceptance Criteria:**
- [ ] Selecting a project shows story list in main content
- [ ] Stories display title, description, and priority
- [ ] Acceptance criteria are visible on story cards
- [ ] Pass/fail status is indicated visually
- [ ] Empty state shows when no stories exist
- [ ] Verify in browser using dev-browser skill
- [ ] Story cards have sufficient color contrast

### US-010: Create New Story
**Description:** As a user, I want to create a new story so I can add work items to a project.

**Acceptance Criteria:**
- [ ] "Add Story" or "+" button is visible when project selected
- [ ] Clicking button opens create story modal
- [ ] Modal has fields for title, description, priority, acceptance criteria
- [ ] Submitting creates story and adds to list
- [ ] Story persists to `.ideate/prd.json` in project folder
- [ ] Verify in browser using dev-browser skill
- [ ] Form fields are keyboard accessible

### US-011: Edit Story
**Description:** As a user, I want to edit an existing story so I can update details.

**Acceptance Criteria:**
- [ ] Clicking edit on a story opens edit modal
- [ ] All current values are pre-filled
- [ ] Changes are saved when submitted
- [ ] Updated story displays in list
- [ ] Changes persist to `prd.json`
- [ ] Verify in browser using dev-browser skill

### US-012: Delete Story
**Description:** As a user, I want to delete a story so I can remove completed or invalid items.

**Acceptance Criteria:**
- [ ] Delete button/action is available on story cards
- [ ] Confirmation is shown before deletion
- [ ] Story is removed from list after confirmation
- [ ] Deletion persists to `prd.json`
- [ ] Verify in browser using dev-browser skill

### US-013: Agent Settings Configuration
**Description:** As a user, I want to configure agent settings so I can customize how agents run.

**Acceptance Criteria:**
- [ ] Agent settings panel is accessible from project view
- [ ] Can select agent executable (amp, claude, etc.)
- [ ] Can set autonomy level
- [ ] Settings persist to `.ideate/config.json`
- [ ] Settings load correctly when project is selected
- [ ] Verify in browser using dev-browser skill
- [ ] Dropdown/select elements are keyboard navigable

### US-014: Spawn Agent with Real Executable
**Description:** As a user, I want to spawn a real agent (amp or claude) so I can run automated tasks.

**Acceptance Criteria:**
- [ ] Configure agent to use `amp` or `claude` executable
- [ ] Click run/build button to spawn agent
- [ ] Agent process starts successfully
- [ ] Process ID is returned and tracked
- [ ] No errors in Rust backend when spawning
- [ ] Agent runs in the correct working directory (project path)

### US-015: Agent Output Streaming
**Description:** As a user, I want to see agent output in real-time so I can monitor progress.

**Acceptance Criteria:**
- [ ] Log panel displays in the UI
- [ ] stdout from agent appears in log panel
- [ ] stderr from agent appears in log panel (possibly styled differently)
- [ ] Output updates in real-time without manual refresh
- [ ] Large output doesn't crash the app
- [ ] Verify in browser using dev-browser skill
- [ ] Log panel is scrollable and readable

### US-016: Kill Running Agent
**Description:** As a user, I want to stop a running agent so I can cancel tasks.

**Acceptance Criteria:**
- [ ] Stop/Kill button is visible when agent is running
- [ ] Clicking stop sends SIGTERM to agent process
- [ ] Agent process terminates within 5 seconds (or SIGKILL after timeout)
- [ ] UI updates to show agent is no longer running
- [ ] No orphaned processes remain
- [ ] Can spawn a new agent after killing previous one

### US-017: Agent Exit Handling
**Description:** As a user, I want to know when an agent finishes so I can see results.

**Acceptance Criteria:**
- [ ] When agent exits naturally, exit event is emitted
- [ ] Exit code is displayed in UI
- [ ] Success/failure is indicated visually
- [ ] UI state updates (run button re-enabled, etc.)
- [ ] Verify in browser using dev-browser skill

### US-018: Keyboard Navigation
**Description:** As a user, I want to navigate the app with keyboard so I can work efficiently.

**Acceptance Criteria:**
- [ ] Cmd+N opens new project modal
- [ ] Escape closes open modals
- [ ] Tab navigates through interactive elements
- [ ] Enter activates focused buttons
- [ ] Arrow keys navigate project list (if implemented)
- [ ] Focus indicators are visible on all interactive elements
- [ ] Verify keyboard shortcuts work in dev-browser

### US-019: Accessibility Audit
**Description:** As a user with accessibility needs, I want the app to be accessible so I can use it effectively.

**Acceptance Criteria:**
- [ ] All interactive elements have visible focus states
- [ ] Color contrast ratio meets WCAG AA (4.5:1 for text)
- [ ] Form inputs have associated labels
- [ ] Buttons have accessible names
- [ ] Modal dialogs trap focus appropriately
- [ ] No keyboard traps exist
- [ ] Screen reader can navigate main sections

### US-020: Error Handling and Edge Cases
**Description:** As a user, I want the app to handle errors gracefully so I don't lose work.

**Acceptance Criteria:**
- [ ] Creating project in read-only directory shows error message
- [ ] Invalid JSON in config files doesn't crash app
- [ ] Missing project folder is handled gracefully
- [ ] Network errors (if any) are displayed to user
- [ ] App recovers from agent spawn failures
- [ ] No unhandled promise rejections in console

## Functional Requirements

- FR-1: The app must compile with `pnpm tauri dev` without errors
- FR-2: The app must compile with `pnpm tauri build` without errors
- FR-3: The DMG bundle must be created and mountable
- FR-4: The app must launch and display the main window
- FR-5: Projects must be creatable with name, description, and directory
- FR-6: Projects must persist across app restarts via `projects.json`
- FR-7: Project folders must contain `.ideate/config.json`
- FR-8: Stories must be creatable, editable, and deletable
- FR-9: Stories must persist to `.ideate/prd.json`
- FR-10: Agent settings must be configurable and persist
- FR-11: Agents must be spawnable with real executables (amp/claude)
- FR-12: Agent stdout/stderr must stream to UI in real-time
- FR-13: Agents must be killable with SIGTERM/SIGKILL
- FR-14: Keyboard shortcuts (Cmd+N, Escape) must work
- FR-15: All UI must meet WCAG AA accessibility standards

## Non-Goals

- Automated test framework implementation (this PRD is for manual testing)
- Windows or Linux testing (macOS only)
- Performance benchmarking
- Security penetration testing
- CI/CD pipeline setup
- Code signing and notarization

## Technical Considerations

- Tauri 2.x is used with plugins: dialog, fs, shell
- Frontend is React 19 with TypeScript and Tailwind CSS
- State management via Zustand
- Agent processes are tracked in a Rust Mutex HashMap
- App data stored in Tauri's app data directory
- Real agent testing requires `amp` or `claude` CLI installed

## Success Metrics

- All 20 user stories pass acceptance criteria
- Zero runtime panics during testing
- Zero critical console errors
- App launches in under 3 seconds
- DMG installs without errors on clean macOS system

## Open Questions

- Should we test with both Intel and Apple Silicon builds?
- Is code signing required for full testing, or can we test unsigned?
- What version of macOS should be the minimum target?
- Should we test with VoiceOver for full accessibility verification?
