# Contributing to Opslane

Thank you for your interest in contributing to Opslane! This guide will help you get started.

## Development Setup

### Prerequisites
- Node.js 18+
- Rust 1.77+
- Docker Desktop (running)
- Claude Code CLI with OAuth credentials configured

### First Time Setup

1. Clone the repository:
```bash
git clone https://github.com/opslane/opslane.git
cd opslane
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run tauri:dev
```

The app will open with hot reload enabled for both frontend and backend changes.

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
│   ├── src/
│   │   ├── commands/ # Tauri IPC commands
│   │   ├── services/ # Business logic
│   │   └── models/   # Data structures
│   └── Cargo.toml    # Rust dependencies
└── specs/            # Product documentation
```

## Development Workflow

### Frontend Development

For UI-only changes, you can run just the frontend:

```bash
npm run dev
```

This starts Vite dev server on port 5173 without launching Tauri.

### Backend Development

Backend changes require the full Tauri dev environment:

```bash
npm run tauri:dev
```

### Type Checking

Run TypeScript type checking:

```bash
npm run typecheck
```

### Linting

Check code style:

```bash
npm run lint
```

## Adding New Tauri Commands

Tauri commands allow the React frontend to invoke Rust backend functions. Here's how to add one:

### 1. Define the Command

In `src-tauri/src/commands/`, create or update a command file:

```rust
use tauri::State;
use crate::state::AppState;

#[tauri::command]
pub async fn my_new_command(
    param: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Your implementation here
    Ok(format!("Processed: {}", param))
}
```

### 2. Register the Command

In `src-tauri/src/lib.rs`, add your command to the invoke handler:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    commands::my_new_command,
])
```

### 3. Call from Frontend

In your React component:

```typescript
import { invoke } from "@tauri-apps/api/core";

const result = await invoke<string>("my_new_command", {
    param: "value"
});
```

### Command Best Practices

- Use `async` for I/O operations (database, Docker, file system)
- Return `Result<T, String>` for error handling
- Accept `State<'_, AppState>` to access services
- Use snake_case for command names (Rust convention)
- Keep commands thin - delegate to services for business logic

## Database Migrations

When modifying the database schema:

1. Create a new migration file in `src-tauri/migrations/`
2. Follow the naming pattern: `YYYYMMDDHHMMSS_description.sql`
3. Include both `UP` and `DOWN` migrations
4. Test migration applies cleanly on fresh database

## Testing

### Running Tests

```bash
# Frontend tests
npm test

# Backend tests (when implemented)
cd src-tauri && cargo test
```

### Writing Tests

- Write unit tests for business logic in services
- Write integration tests for Tauri commands
- Test error cases and edge conditions
- Mock external dependencies (Docker, file system)

## Code Style

### TypeScript/React

- Use functional components with hooks
- Prefer `const` over `let`
- Use TypeScript strict mode
- Follow existing patterns in codebase
- Use React Query for server state
- Use Zustand for UI state

### Rust

- Follow Rust standard style (use `cargo fmt`)
- Use `clippy` for linting (`cargo clippy`)
- Prefer explicit error handling over unwrap
- Use `thiserror` for custom errors
- Keep services focused and testable

## Submitting Changes

### Before Submitting a PR

1. Ensure all tests pass
2. Run type checking and linting
3. Update documentation if needed
4. Test your changes thoroughly
5. Write clear commit messages

### PR Guidelines

- Reference related issues in PR description
- Provide clear description of changes
- Include screenshots for UI changes
- Keep PRs focused on single concern
- Respond to review feedback promptly

## Getting Help

- 📖 Read the [specs documentation](specs/)
- 🐛 Check [existing issues](https://github.com/opslane/opslane/issues)
- 💬 Ask questions in issues or discussions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
