# Opslane Desktop

A cross-platform desktop application built with Tauri 2.0, React 19, and TypeScript.

## Tech Stack

- **Backend**: Tauri 2.0 (Rust)
- **Frontend**: React 19 + TypeScript
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS 4
- **Package Manager**: npm

## Performance Characteristics

Based on the [cross-platform architecture research](thoughts/shared/research/2025-01-13-cross-platform-desktop-architecture.md):

- **Bundle Size**: 3-10 MB (vs 80-120 MB for Electron)
- **Memory Usage**: 30-40 MB idle (vs 100+ MB for Electron)
- **Startup Time**: <500ms (vs 1-2s for Electron)
- **Native Performance**: Direct system calls via Rust

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) 1.70+
- [Node.js](https://nodejs.org/) 18+
- Platform-specific dependencies:
  - **macOS**: Xcode Command Line Tools
  - **Linux**: webkit2gtk, build-essential, curl, wget, libssl-dev, libgtk-3-dev, libayatana-appindicator3-dev, librsvg2-dev
  - **Windows**: Microsoft Visual Studio C++ Build Tools

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd opslane

# Install dependencies
npm install

# Install Tauri CLI (if not already installed)
cargo install tauri-cli --version "^2.0"
```

## Development

```bash
# Start development server with hot reload
npm run tauri:dev

# Run frontend only (useful for UI development)
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Building

```bash
# Build for production
npm run tauri:build

# The built application will be in:
# - macOS: src-tauri/target/release/bundle/macos/
# - Windows: src-tauri/target/release/bundle/msi/
# - Linux: src-tauri/target/release/bundle/deb/ or .appimage
```

## Project Structure

```
opslane/
├── src/                    # React frontend
│   ├── App.tsx            # Main React component
│   ├── App.css            # Component styles
│   ├── main.tsx           # React entry point
│   └── index.css          # Global styles
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── lib.rs         # Tauri application & commands
│   │   └── main.rs        # Application entry point
│   ├── icons/             # Application icons
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # Tauri configuration
├── index.html             # HTML entry point
├── package.json           # Node dependencies & scripts
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript configuration
└── tailwind.config.js     # Tailwind CSS configuration
```

## Architecture

### Frontend → Backend Communication

The app uses Tauri commands to communicate between React (frontend) and Rust (backend):

```typescript
// Frontend (TypeScript)
import { invoke } from "@tauri-apps/api/core";

const result = await invoke<string>("greet", { name: "World" });
```

```rust
// Backend (Rust)
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}
```

### Adding New Tauri Commands

1. Define command in `src-tauri/src/lib.rs`:
```rust
#[tauri::command]
fn my_command(param: &str) -> Result<String, String> {
    Ok(format!("Received: {}", param))
}
```

2. Register command in `run()` function:
```rust
.invoke_handler(tauri::generate_handler![greet, get_system_info, my_command])
```

3. Call from frontend:
```typescript
const result = await invoke<string>("my_command", { param: "value" });
```

## Troubleshooting

### Development server won't start
- Ensure port 5173 is not in use
- Check that Node.js and Rust are properly installed
- Try `npm install` again

### Rust compilation errors
- Update Rust: `rustup update`
- Clear Cargo cache: `cd src-tauri && cargo clean`
- Check platform-specific dependencies are installed

### Hot reload not working
- Restart dev server: Ctrl+C and `npm run tauri:dev`
- Check that file watcher isn't hitting limits (Linux: increase inotify watches)

## Resources

- [Tauri Documentation](https://tauri.app/)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [Research Document](thoughts/shared/research/2025-01-13-cross-platform-desktop-architecture.md)

## License

[Your License Here]
