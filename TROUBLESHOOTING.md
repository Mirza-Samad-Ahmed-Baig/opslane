# Troubleshooting Guide

This guide helps you resolve common issues when using or developing Opslane.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Docker Issues](#docker-issues)
- [Development Server Issues](#development-server-issues)
- [Rust Compilation Issues](#rust-compilation-issues)
- [Session Creation Issues](#session-creation-issues)
- [Performance Issues](#performance-issues)

---

## Installation Issues

### Prerequisites Not Met

**Problem**: Installation fails with missing dependencies

**Solution**:
1. Verify Node.js version:
   ```bash
   node --version  # Should be 18.0.0 or higher
   ```

2. Verify Rust version:
   ```bash
   rustc --version  # Should be 1.77.0 or higher
   ```

3. Update if needed:
   ```bash
   # Node.js (via nvm)
   nvm install 18

   # Rust
   rustup update
   ```

### npm install Fails

**Problem**: `npm install` exits with errors

**Solution**:
1. Clear npm cache:
   ```bash
   npm cache clean --force
   ```

2. Delete existing node_modules:
   ```bash
   rm -rf node_modules package-lock.json
   ```

3. Retry installation:
   ```bash
   npm install
   ```

---

## Docker Issues

### Docker Not Running

**Problem**: "Docker daemon is not running" error

**Solution**:
1. Start Docker Desktop application
2. Wait for Docker to fully initialize (whale icon in menu bar should be steady)
3. Verify Docker is running:
   ```bash
   docker ps
   ```

### Container Creation Fails

**Problem**: Session creation fails with Docker errors

**Solution**:
1. Check Docker disk space:
   ```bash
   docker system df
   ```

2. Clean up unused containers/images if needed:
   ```bash
   docker system prune -a
   ```

3. Verify Docker has enough resources:
   - Open Docker Desktop → Settings → Resources
   - Ensure at least 4GB memory and 2 CPU cores allocated

### Permission Denied Errors

**Problem**: "Permission denied" when accessing Docker

**Solution** (macOS/Linux):
1. Ensure your user is in the docker group:
   ```bash
   sudo usermod -aG docker $USER
   ```

2. Log out and log back in for changes to take effect

3. Verify:
   ```bash
   docker run hello-world
   ```

---

## Development Server Issues

### Port Already in Use

**Problem**: "Port 5173 is already in use"

**Solution**:
1. Find the process using port 5173:
   ```bash
   lsof -i :5173
   ```

2. Kill the process:
   ```bash
   kill -9 <PID>
   ```

3. Or use a different port:
   ```bash
   PORT=5174 npm run dev
   ```

### Hot Reload Not Working

**Problem**: Changes don't trigger automatic reload

**Solution**:
1. Restart the dev server:
   ```bash
   # Press Ctrl+C, then
   npm run tauri:dev
   ```

2. **Linux only** - Increase inotify watch limit:
   ```bash
   echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
   sudo sysctl -p
   ```

3. Check for file watcher errors in terminal output

### Frontend Loads But Backend Doesn't Start

**Problem**: Browser opens but app doesn't connect to Tauri

**Solution**:
1. Check Rust compilation logs for errors
2. Verify Cargo.toml dependencies are correct
3. Try clean rebuild:
   ```bash
   cd src-tauri
   cargo clean
   cd ..
   npm run tauri:dev
   ```

---

## Rust Compilation Issues

### Compilation Fails

**Problem**: Rust build errors during `npm run tauri:dev`

**Solution**:
1. Update Rust to latest stable:
   ```bash
   rustup update stable
   ```

2. Clear Cargo build cache:
   ```bash
   cd src-tauri
   cargo clean
   ```

3. Check for platform-specific dependencies:
   - **macOS**: Xcode Command Line Tools
     ```bash
     xcode-select --install
     ```
   - **Linux**: build-essential, pkg-config, libssl-dev
     ```bash
     sudo apt-get install build-essential pkg-config libssl-dev
     ```

### Dependency Resolution Errors

**Problem**: Cargo can't resolve dependencies

**Solution**:
1. Update Cargo.lock:
   ```bash
   cd src-tauri
   cargo update
   ```

2. Clear Cargo cache:
   ```bash
   rm -rf ~/.cargo/registry
   cargo fetch
   ```

---

## Session Creation Issues

### Claude CLI Credentials Not Found

**Problem**: "Claude credentials not configured" error

**Solution**:
1. Verify Claude Code CLI is installed:
   ```bash
   which claude
   ```

2. Login to Claude Code:
   ```bash
   claude auth login
   ```

3. Verify credentials are stored:
   ```bash
   ls -la ~/.claude/.credentials.json
   ```

### Repository Copy Fails

**Problem**: Session creation stuck at "Copying repository"

**Solution**:
1. Check available disk space:
   ```bash
   df -h /tmp
   ```

2. Verify repository path is accessible:
   ```bash
   ls -la /path/to/your/repo
   ```

3. Check for .gitignore issues preventing file access

### Container Fails to Start

**Problem**: Session status shows "error" after creation

**Solution**:
1. Check container logs:
   - Click the session in the UI
   - Look for "View Logs" or error details

2. Verify Docker resource limits in Settings → Resources

3. Try creating a new session with smaller repository

---

## Performance Issues

### High Memory Usage

**Problem**: App uses excessive memory

**Solution**:
1. Check number of active sessions - consider archiving old ones
2. Reduce Docker container memory limits in Settings
3. Close unused sessions
4. Restart the application

### Slow UI Response

**Problem**: UI feels sluggish or unresponsive

**Solution**:
1. Check Docker Desktop CPU usage
2. Reduce number of concurrent sessions
3. Clear browser cache if using dev server
4. Restart the application

### Large Repository Performance

**Problem**: Session creation very slow with large repos

**Solution**:
1. Ensure repository has proper .gitignore
2. Avoid copying node_modules, .git/objects unnecessarily
3. Consider using smaller test repository first
4. Check Docker disk I/O performance

---

## Still Having Issues?

If none of these solutions work:

1. Check [GitHub Issues](https://github.com/opslane/opslane/issues) for similar problems
2. Create a new issue with:
   - Detailed description of the problem
   - Steps to reproduce
   - Error messages (full text)
   - Operating system and versions
   - Logs from terminal output

3. Visit [opslane.com](https://opslane.com) for additional resources
