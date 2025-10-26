import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

interface CommitMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommit: (message: string) => Promise<void>;
  filesChanged: number;
  additions: number;
  deletions: number;
}

export function CommitMessageDialog({
  open,
  onOpenChange,
  onCommit,
  filesChanged,
  additions,
  deletions,
}: CommitMessageDialogProps) {
  const [message, setMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCommit = async () => {
    if (!message.trim()) {
      setError('Commit message is required');
      return;
    }

    setIsCommitting(true);
    setError(null);

    try {
      await onCommit(message.trim());
      // Success - dialog will close from parent
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit changes');
      setIsCommitting(false);
    }
  };

  const handleCancel = () => {
    setMessage('');
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Commit Changes to Local</DialogTitle>
          <DialogDescription>
            Create a commit on your local repository from the changes made in this session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Change summary */}
          <div className="rounded-md bg-muted p-3 text-sm">
            <div className="font-medium mb-1">Changes to commit:</div>
            <div className="text-muted-foreground">
              {filesChanged} {filesChanged === 1 ? 'file' : 'files'} changed
              {additions > 0 && <span className="text-green-600 ml-2">+{additions}</span>}
              {deletions > 0 && <span className="text-red-600 ml-2">-{deletions}</span>}
            </div>
          </div>

          {/* Commit message input */}
          <div className="space-y-2">
            <label htmlFor="commit-message" className="text-sm font-medium">
              Commit message
            </label>
            <Textarea
              id="commit-message"
              placeholder="Enter a descriptive commit message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              disabled={isCommitting}
              className="resize-none"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          {/* Info messages */}
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="text-blue-500">ⓘ</span>
              <span>Two-way sync will be paused during commit</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-500">ⓘ</span>
              <span>Container will be reset to match local after commit</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-500">ⓘ</span>
              <span>Sync will resume automatically after commit</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isCommitting}>
            Cancel
          </Button>
          <Button onClick={handleCommit} disabled={isCommitting || !message.trim()}>
            {isCommitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isCommitting ? 'Committing...' : 'Commit to Local'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
