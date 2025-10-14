# Troubleshooting

## Database Issues

**"Migration failed"**
```bash
cd src-tauri
sqlx migrate run
```

**"Database locked"**
- Close the app
- Delete .db-shm and .db-wal files
- Restart

## Build Issues

**"Rust compilation failed"**
```bash
rustup update
cd src-tauri && cargo clean && cargo build
```

**"Node modules missing"**
```bash
rm -rf node_modules package-lock.json
npm install
```

## Platform-Specific

### macOS
```bash
xattr -cr /Applications/Opslane.app
```

### Linux
```bash
sudo apt-get install libwebkit2gtk-4.0-dev
```

## Logs

**macOS:** `~/Library/Logs/com.opslane.app/`
**Linux:** `~/.local/share/opslane/`
**Windows:** `%APPDATA%\com.opslane.app\logs\`
