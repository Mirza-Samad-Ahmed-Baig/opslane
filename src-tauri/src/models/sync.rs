use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub files_synced: usize,
    pub files_failed: Vec<SyncError>,
    pub bytes_synced: u64,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncError {
    pub path: String,
    pub error: String,
}
