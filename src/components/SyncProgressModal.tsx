import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { SyncProgress } from '@/types/sync';

interface SyncProgressModalProps {
  open: boolean;
  progress: SyncProgress | null;
  onCancel?: () => void;
}

export function SyncProgressModal({ open, progress, onCancel }: SyncProgressModalProps) {
  if (!progress) return null;

  const percentage = (progress.current / progress.total) * 100;

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        /* Allow closing but continue sync in background */
      }}
    >
      <DialogContent className="max-w-md" aria-describedby="sync-progress-description">
        <DialogHeader>
          <DialogTitle>Syncing Changes</DialogTitle>
          <DialogDescription id="sync-progress-description">
            Copying files to your project directory
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium truncate text-muted-foreground" title={progress.message}>
                {progress.message}
              </span>
              <span className="text-muted-foreground text-xs">{percentage.toFixed(0)}%</span>
            </div>
            <Progress value={percentage} aria-label="Sync progress" />
            <p className="text-xs text-muted-foreground text-center">
              {progress.current} of {progress.total} files
            </p>
          </div>

          {onCancel && (
            <Button variant="outline" onClick={onCancel} className="w-full">
              Cancel Sync
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
