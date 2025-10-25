import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Session } from '@/types/session';

interface EnableSyncConfirmationProps {
  session: Session;
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation dialog for enabling two-way sync
 * Design Principle #3: Resilient by Default - Explicit confirmation required
 * Design Principle #5: Progressive Disclosure - Essential info first
 */
export function EnableSyncConfirmation({
  session,
  open,
  onConfirm,
  onCancel,
}: EnableSyncConfirmationProps) {
  const [understood, setUnderstood] = useState(false);

  const handleConfirm = () => {
    onConfirm();
    setUnderstood(false); // Reset for next time
  };

  const handleCancel = () => {
    onCancel();
    setUnderstood(false); // Reset for next time
  };

  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && handleCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Enable Two-Way Sync?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            {/* Progressive disclosure - essential info first (Principle #5) */}
            <p className="font-medium">
              This will keep your local files and "{session.name}" in sync
            </p>

            {/* Clear consequences (Principle #4: Transparent State) */}
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3">
              <p className="text-sm space-y-1">
                <span className="block">• Local changes automatically copy to this session</span>
                <span className="block">• Session changes automatically sync back to local</span>
                <span className="block">• Other sessions remain isolated</span>
                <span className="block">• You can stop syncing anytime</span>
              </p>
            </div>

            {/* Explicit confirmation required (Principle #3) */}
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={understood}
                onCheckedChange={(checked: boolean) => setUnderstood(!!checked)}
                className="mt-0.5"
              />
              <span className="text-sm select-none">
                I understand files will sync in both directions
              </span>
            </label>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!understood}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            Enable Sync
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
