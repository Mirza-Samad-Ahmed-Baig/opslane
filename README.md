# Opslane

Desktop app for managing multiple Claude Code sessions in parallel.

## What is Opslane?

Opslane lets you work on multiple projects simultaneously with Claude AI assistance. Each session runs in an isolated Docker container, allowing you to experiment, iterate, and develop features without affecting your local repositories.

Claude can work on different features across multiple projects, review changes in real-time, and selectively apply them to your local codebase when ready.

## Key Features

- 🚀 **Multi-Session Management** - Work on multiple projects simultaneously with isolated sessions
- 🔍 **Live Diff Viewer** - Review all file changes with syntax highlighting before applying
- 🔄 **Two-Way Sync** - Optional bidirectional file synchronization between container and local repo
- 📦 **Docker Isolation** - Each session runs in its own container with resource limits
- 📚 **Session Archiving** - Preserve completed sessions for future reference

## Quick Start

### Prerequisites

- Node.js 18+
- Rust 1.77+
- Docker Desktop (running)
- Claude Code CLI with OAuth credentials configured

### Installation

```bash
git clone https://github.com/opslane/opslane.git
cd opslane
npm install
npm run tauri:dev
```

The app will launch with hot reload enabled for development.

### First Session

1. Click "New Session" in the app
2. Select a local Git repository
3. Describe your task (e.g., "Add user authentication")
4. Choose a Claude model (Sonnet, Opus, or Haiku)
5. Click "Start Session"

Claude will begin working in an isolated container while you monitor progress in real-time.

## How It Works

1. **Create Session** - Select project directory, describe task, choose Claude model
2. **Claude Works** - AI reads files, edits code, runs commands in isolated container
3. **Review Changes** - View diffs in real-time with syntax highlighting
4. **Sync to Local** - Apply container changes to your local repository when ready
5. **Archive** - Preserve session history for future reference

Each session is completely isolated - experiments in one session never affect others or your local files until you explicitly sync changes.

## Tech Stack

- **Backend**: Tauri 2.0 (Rust)
- **Frontend**: React 19 + TypeScript
- **Database**: SQLite
- **Styling**: Tailwind CSS 4
- **Build Tool**: Vite 5

## Development

### Common Commands

```bash
# Start development server with hot reload
npm run tauri:dev

# Run frontend only (UI development)
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Build for production
npm run tauri:build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development guidelines, including how to add Tauri commands and submit pull requests.

## Documentation

- [Product Requirements](specs/prd.md) - Product vision and goals
- [Architecture](specs/architecture.md) - System architecture and design
- [Design Principles](specs/design-principles.md) - Core design philosophy
- [UX Design](specs/ux-design.md) - User experience and interaction design
- [Database Schema](specs/database-schema.md) - Data models and migrations
- [Milestones](specs/milestones.md) - Implementation roadmap

## Project Structure

```
opslane/
├── src/              # React frontend
│   ├── components/   # UI components
│   ├── hooks/        # Custom React hooks
│   ├── lib/          # Utilities and helpers
│   └── types/        # TypeScript types
├── src-tauri/        # Rust backend
│   ├── migrations/   # SQLite migrations
│   └── src/
│       ├── commands/ # Tauri IPC commands
│       ├── services/ # Business logic
│       └── models/   # Data structures
└── specs/            # Product documentation
```

## Troubleshooting

Having issues? Check the [Troubleshooting Guide](TROUBLESHOOTING.md) for solutions to common problems:

- Docker not running
- Port conflicts
- Rust compilation errors
- Hot reload issues
- Session creation failures

## Support

- 📖 [Documentation](https://opslane.com)
- 🐛 [Issue Tracker](https://github.com/opslane/opslane/issues)
- 💬 Discord community - TODO

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:

- Development setup
- Code style and standards
- Adding new features
- Submitting pull requests

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Resources

- [Tauri Documentation](https://tauri.app/)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
