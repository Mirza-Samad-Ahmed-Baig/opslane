export interface SyncResult {
  files_synced: number;
  files_failed: SyncError[];
  bytes_synced: number;
  duration_ms: number;
}

export interface SyncError {
  path: string;
  error: string;
}

export interface SyncProgress {
  session_id: string;
  message: string;
  current: number;
  total: number;
}

export interface SyncStatusEvent {
  session_id: string;
  status: 'idle' | 'syncing' | 'synced' | 'error';
}
