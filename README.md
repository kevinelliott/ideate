# Ideate

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Website](https://img.shields.io/badge/website-ideate.sh-purple)](https://ideate.sh)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev)
[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db)](https://tauri.app)

**Idea + Create. IDE ATE (we ate your IDE).**

Ideate is a desktop application for managing AI coding agent workflows. Start with a simple idea, and let AI agents build your complete application.

## Features

- **Idea to Application**: Describe your idea in a sentence or two, and Ideate generates a full PRD with user stories and acceptance criteria
- **Multiple Build Modes**: Choose how agents execute your project: sequential, parallel, or manual
- **8 AI Agents Supported**: Work with the AI coding tools you already use
- **Project Management**: Organize ideas, stories, and build progress in one place
- **Real-time Terminal**: Watch agents work with integrated terminal output
- **Cost Tracking**: Monitor API usage and costs across agent runs

## Screenshots

<!-- TODO: Add screenshots -->

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (required by Vite 7)
- [pnpm](https://pnpm.io/) 9+
- [Rust](https://www.rust-lang.org/) 1.70+
- [Bun](https://bun.sh/) (required to build OutRay sidecar binary)
- Tauri CLI: `cargo install tauri-cli`

### Platform-Specific Setup

#### Windows WSL (Ubuntu)

1. **Install Node.js via nvm** (recommended for version management):
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   source ~/.bashrc
   nvm install 22
   nvm use 22
   ```

2. **Install pnpm**:
   ```bash
   npm install -g pnpm
   ```

3. **Install Rust**:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source ~/.cargo/env
   ```

4. **Install GTK/WebKit development libraries** (required for Tauri):
   ```bash
   sudo apt update && sudo apt install -y \
     libgtk-3-dev \
     libwebkit2gtk-4.1-dev \
     libayatana-appindicator3-dev \
     librsvg2-dev
   ```

5. **Install Bun** (required to build OutRay sidecar):
   ```bash
   curl -fsSL https://bun.sh/install | bash
   source ~/.bashrc
   ```

#### macOS

```bash
# Install Xcode Command Line Tools
xcode-select --install
```

#### Linux (Debian/Ubuntu)

```bash
sudo apt update && sudo apt install -y \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

### Installation

```bash
# Clone the repository
git clone https://github.com/kevinelliott/ideate.git
cd ideate/ideate-desktop

# Install dependencies
pnpm install
```

### Development

```bash
# Start the development server (web only)
pnpm dev

# Start the Tauri desktop app in development mode
pnpm tauri dev
```

### Building

```bash
# Build for production
pnpm build

# Build the Tauri desktop app
pnpm tauri build

# Build everything (including Outray components)
pnpm build:all
```

## Build Modes

Ideate offers three ways to execute your project with AI agents:

### Ralph Mode (Sequential)

Executes user stories one at a time in order. The Ralph agent system processes each story sequentially, ensuring dependencies are respected and changes are stable before moving forward.

### Parallel Mode

Runs multiple AI agents simultaneously on different stories. Ideal for projects with independent components that can be built concurrently.

### Manual Mode

Step through stories one at a time with full control. Review each change, approve or modify, then proceed to the next story.

## Supported AI Agents

| Agent | Description |
|-------|-------------|
| **Claude Code** | Anthropic's Claude with code capabilities |
| **Amp** | Sourcegraph's AI coding assistant |
| **OpenCode** | Open source AI coding agent |
| **Droid** | Android-focused AI development |
| **Codex** | OpenAI's code generation model |
| **Cursor** | AI-first code editor |
| **Continue** | Open source AI code assistant |
| **GitHub Copilot** | GitHub's AI pair programmer |

## Project Structure

```
ideate-desktop/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── hooks/              # Custom React hooks
│   ├── stores/             # Zustand state management
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Utility functions
├── src-tauri/              # Tauri backend (Rust)
├── public/                 # Static assets
├── scripts/                # Build scripts
└── tasks/                  # Task definitions
```

## Tech Stack

**Frontend**
- React 19
- TypeScript 5.8
- Vite 7
- Tailwind CSS 4
- Zustand 5 (state management)
- xterm.js (terminal emulation)

**Backend**
- Tauri 2 (desktop framework)
- Rust
- Tokio (async runtime)

**Plugins**
- tauri-plugin-dialog
- tauri-plugin-fs
- tauri-plugin-notification
- tauri-plugin-shell

## Contributing

Contributions are welcome. Please open an issue or submit a pull request.

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a pull request

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

**Website**: [https://ideate.sh](https://ideate.sh)
