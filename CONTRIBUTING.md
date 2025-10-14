# Contributing

## Setup

1. **Install prerequisites**
   - Node.js 18+
   - Rust 1.77+
   - Docker Desktop

2. **Clone and install**
   ```bash
   git clone https://github.com/opslane/opslane.git
   cd opslane
   npm install
   ```

3. **Run dev server**
   ```bash
   npm run tauri:dev
   ```

## Code Quality

Before committing:
```bash
# Frontend
npm run lint
npm run typecheck
npm run format:check

# Backend
cd src-tauri
cargo fmt --check
cargo clippy
cargo test
```

Pre-commit hooks run automatically.

## Pull Requests

1. Create feature branch: `git checkout -b feature/description`
2. Make changes with tests
3. Ensure all checks pass
4. Open PR against `main`

## Commit Format

```
type(scope): description

Examples:
feat(database): add settings table
fix(ci): update rust version
docs(readme): add setup instructions
```
