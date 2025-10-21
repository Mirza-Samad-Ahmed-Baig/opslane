import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import type { FileChange } from '@/hooks/useSessionChanges';

interface SyncConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  changes: FileChange[];
  projectPath: string;
}

export function SyncConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  changes,
  projectPath,
}: SyncConfirmDialogProps) {
  const added = changes.filter((c) => c.status === 'added').length;
  const modified = changes.filter((c) => c.status === 'modified').length;
  const deleted = changes.filter((c) => c.status === 'deleted').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sync Changes to Project</DialogTitle>
          <DialogDescription>
            This will overwrite files in your project directory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Warning Banner */}
          <div
            className="flex items-start gap-3 rounded-lg border border-status-warning-border bg-status-warning-bg p-4"
            role="alert"
            aria-label="Destructive action warning"
          >
            <AlertTriangle
              className="h-5 w-5 text-status-warning-fg flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="text-sm text-status-warning-fg">
              <p className="font-medium">This will overwrite existing files</p>
              <p className="mt-1 opacity-90">
                Files in{' '}
                <code className="bg-status-warning-border/20 px-1 rounded">{projectPath}</code> will
                be replaced. Make sure you have committed or backed up any important changes.
              </p>
            </div>
          </div>

          {/* File Summary */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Files to sync:</p>
            <div className="flex gap-4 text-sm">
              {added > 0 && <span className="text-status-success-fg">+{added} added</span>}
              {modified > 0 && <span className="text-status-info-fg">~{modified} modified</span>}
              {deleted > 0 && <span className="text-status-error-fg">-{deleted} deleted</span>}
            </div>
          </div>

          {/* File List (scrollable) */}
          <div
            className="max-h-60 overflow-y-auto rounded border bg-muted p-3"
            role="region"
            aria-label="Files to be synced"
          >
            <div className="space-y-1 font-mono text-xs">
              {changes.map((change) => (
                <div key={change.path} className="flex items-center gap-2">
                  <span
                    className={`
                      w-8 text-center rounded px-1
                      ${change.status === 'added' ? 'bg-status-success-bg text-status-success-fg' : ''}
                      ${change.status === 'modified' ? 'bg-status-info-bg text-status-info-fg' : ''}
                      ${change.status === 'deleted' ? 'bg-status-error-bg text-status-error-fg' : ''}
                    `}
                    aria-label={
                      change.status === 'added'
                        ? 'Added'
                        : change.status === 'modified'
                          ? 'Modified'
                          : 'Deleted'
                    }
                    title={
                      change.status === 'added'
                        ? 'Added'
                        : change.status === 'modified'
                          ? 'Modified'
                          : 'Deleted'
                    }
                  >
                    {change.status === 'added' && 'A'}
                    {change.status === 'modified' && 'M'}
                    {change.status === 'deleted' && 'D'}
                  </span>
                  <span className="text-foreground">{change.path}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            variant="default"
          >
            Sync {changes.length} {changes.length === 1 ? 'File' : 'Files'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
