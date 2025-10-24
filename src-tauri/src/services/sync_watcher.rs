use anyhow::Result;
use log::{debug, error, info};
use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use tokio::sync::{mpsc, RwLock};

/// Single active file watcher for two-way sync
/// Only ONE session can be actively syncing at a time
pub struct SyncWatcher {
    active_session: Arc<RwLock<Option<ActiveSyncState>>>,
    watcher_handle: Arc<RwLock<Option<Debouncer<RecommendedWatcher>>>>,
    event_sender: Arc<RwLock<Option<mpsc::UnboundedSender<FileChangeEvent>>>>,
}

#[derive(Debug, Clone)]
struct ActiveSyncState {
    session_id: String,
    _project_path: PathBuf,
    started_at: SystemTime,
}

#[derive(Debug, Clone)]
pub struct FileChangeEvent {
    pub session_id: String,
    pub path: PathBuf,
    pub kind: FileChangeKind,
}

#[derive(Debug, Clone)]
pub enum FileChangeKind {
    Create,
    Modify,
    Remove,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SyncStatus {
    pub session_id: String,
    pub duration_secs: u64,
    pub is_active: bool,
}

impl SyncWatcher {
    pub fn new() -> Self {
        Self {
            active_session: Arc::new(RwLock::new(None)),
            watcher_handle: Arc::new(RwLock::new(None)),
            event_sender: Arc::new(RwLock::new(None)),
        }
    }

    /// Start watching for a single session (stops any existing watch)
    pub async fn start_sync(
        &self,
        session_id: String,
        project_path: PathBuf,
    ) -> Result<mpsc::UnboundedReceiver<FileChangeEvent>> {
        info!("Starting sync for session {session_id} at {project_path:?}");

        // Stop existing watcher if any
        self.stop_sync().await?;

        // Create channel for file events
        let (tx, rx) = mpsc::unbounded_channel();
        *self.event_sender.write().await = Some(tx.clone());

        // Create debounced watcher (100ms debounce)
        let session_id_clone = session_id.clone();
        let tx_clone = tx.clone();

        let mut debouncer = new_debouncer(
            Duration::from_millis(100),
            move |res: DebounceEventResult| {
                match res {
                    Ok(events) => {
                        for event in events {
                            // Skip system files for calm operation
                            if should_ignore(&event.path) {
                                continue;
                            }

                            let kind = match event.kind {
                                notify_debouncer_mini::DebouncedEventKind::Any => {
                                    FileChangeKind::Modify
                                }
                                _ => FileChangeKind::Modify, // Treat all events as modify for now
                            };

                            debug!("File change detected: {:?} - {:?}", event.path, kind);

                            let _ = tx_clone.send(FileChangeEvent {
                                session_id: session_id_clone.clone(),
                                path: event.path,
                                kind,
                            });
                        }
                    }
                    Err(err) => {
                        error!("File watcher error: {err:?}");
                    }
                }
            },
        )
        .map_err(|e| anyhow::anyhow!("Failed to create debouncer: {e}"))?;

        // Start watching the project directory
        debouncer
            .watcher()
            .watch(&project_path, RecursiveMode::Recursive)
            .map_err(|e| anyhow::anyhow!("Failed to watch directory: {e}"))?;

        // Update state
        *self.active_session.write().await = Some(ActiveSyncState {
            session_id: session_id.clone(),
            _project_path: project_path,
            started_at: SystemTime::now(),
        });

        *self.watcher_handle.write().await = Some(debouncer);

        info!("Started sync for session: {session_id}");
        Ok(rx)
    }

    /// Stop all syncing
    pub async fn stop_sync(&self) -> Result<()> {
        if let Some(state) = self.active_session.read().await.as_ref() {
            info!("Stopping sync for session: {}", state.session_id);
        }

        *self.active_session.write().await = None;
        *self.watcher_handle.write().await = None;
        *self.event_sender.write().await = None;

        info!("Stopped all sync");
        Ok(())
    }

    /// Get current sync state (for UI)
    pub async fn get_sync_status(&self) -> Option<SyncStatus> {
        self.active_session.read().await.as_ref().map(|state| {
            let duration = SystemTime::now()
                .duration_since(state.started_at)
                .unwrap_or_default();

            SyncStatus {
                session_id: state.session_id.clone(),
                duration_secs: duration.as_secs(),
                is_active: true,
            }
        })
    }

    /// Check if a specific session is actively syncing
    pub async fn is_session_active(&self, session_id: &str) -> bool {
        self.active_session
            .read()
            .await
            .as_ref()
            .map(|state| state.session_id == session_id)
            .unwrap_or(false)
    }

    /// Get the active session ID if any
    pub async fn get_active_session_id(&self) -> Option<String> {
        self.active_session
            .read()
            .await
            .as_ref()
            .map(|state| state.session_id.clone())
    }
}

/// Check if file should be ignored for calm operation
fn should_ignore(path: &Path) -> bool {
    let path_str = path.to_string_lossy();

    // System/build files to ignore
    let ignore_patterns = [
        ".git/",
        ".git\\", // Windows
        ".DS_Store",
        "node_modules/",
        "node_modules\\", // Windows
        "target/",
        "target\\", // Windows
        "dist/",
        "dist\\", // Windows
        ".swp",
        ".tmp",
        ".log",
        "~",
        "#",  // Emacs temp files
        ".#", // Emacs lock files
    ];

    ignore_patterns
        .iter()
        .any(|pattern| path_str.contains(pattern))
}

impl Default for SyncWatcher {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use tempfile::TempDir;

    #[test]
    fn test_should_ignore() {
        assert!(should_ignore(Path::new(".git/config")));
        assert!(should_ignore(Path::new("node_modules/package/file.js")));
        assert!(should_ignore(Path::new("target/debug/app")));
        assert!(should_ignore(Path::new(".DS_Store")));
        assert!(should_ignore(Path::new("file.swp")));
        assert!(should_ignore(Path::new("temp.tmp")));
        assert!(should_ignore(Path::new("app.log")));

        assert!(!should_ignore(Path::new("src/main.rs")));
        assert!(!should_ignore(Path::new("README.md")));
        assert!(!should_ignore(Path::new("Cargo.toml")));
    }

    #[tokio::test]
    async fn test_start_stop_sync() {
        let watcher = SyncWatcher::new();
        let temp_dir = TempDir::new().unwrap();

        // Start sync
        let _rx = watcher
            .start_sync("test-session".to_string(), temp_dir.path().to_path_buf())
            .await
            .unwrap();

        // Check status
        let status = watcher.get_sync_status().await;
        assert!(status.is_some());
        assert_eq!(status.unwrap().session_id, "test-session");

        // Stop sync
        watcher.stop_sync().await.unwrap();

        // Check status after stop
        let status = watcher.get_sync_status().await;
        assert!(status.is_none());
    }

    #[tokio::test]
    async fn test_only_one_active_session() {
        let watcher = SyncWatcher::new();
        let temp_dir1 = TempDir::new().unwrap();
        let temp_dir2 = TempDir::new().unwrap();

        // Start first session
        let _rx1 = watcher
            .start_sync("session-1".to_string(), temp_dir1.path().to_path_buf())
            .await
            .unwrap();

        assert!(watcher.is_session_active("session-1").await);
        assert!(!watcher.is_session_active("session-2").await);

        // Start second session (should replace first)
        let _rx2 = watcher
            .start_sync("session-2".to_string(), temp_dir2.path().to_path_buf())
            .await
            .unwrap();

        assert!(!watcher.is_session_active("session-1").await);
        assert!(watcher.is_session_active("session-2").await);

        assert_eq!(
            watcher.get_active_session_id().await,
            Some("session-2".to_string())
        );
    }
}
