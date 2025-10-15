import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';

interface ContainerLogsDialogProps {
  sessionId: string;
  sessionName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContainerLogsDialog({
  sessionId,
  sessionName,
  open,
  onOpenChange,
}: ContainerLogsDialogProps) {
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const result = await invoke<string>('get_container_logs', { sessionId });
      setLogs(result);
    } catch (error) {
      setLogs(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchLogs();
    }
  }, [open, sessionId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[600px] flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Container Logs - {sessionName}</DialogTitle>
          <Button variant="ghost" size="icon" onClick={fetchLogs} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-black text-green-400 font-mono text-xs p-4 rounded">
          <pre>{logs || 'No logs available'}</pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
