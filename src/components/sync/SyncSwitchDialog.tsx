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
import { useSyncSwitch } from '@/hooks/useSyncSwitch';

interface SyncSwitchDialogProps {
  projectId: string;
  getSessionName?: (sessionId: string) => string;
}

/**
 * Dialog for switching active sync session
 * Design Principle #3: Resilient by Default - Confirm before switching
 * Design Principle #4: Transparent State - Clear consequences
 */
export function SyncSwitchDialog({
  projectId,
  getSessionName = (id) => id,
}: SyncSwitchDialogProps) {
  const { switchRequest, confirmSwitch, cancelSwitch, isProcessing } = useSyncSwitch(projectId);

  if (!switchRequest) {
    return null;
  }

  const currentName = getSessionName(switchRequest.current);
  const requestedName = getSessionName(switchRequest.requested);

  return (
    <AlertDialog open={true} onOpenChange={(open) => !open && cancelSwitch()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Switch Active Sync Session?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              <strong>"{currentName}"</strong> is currently syncing with local files.
            </p>

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3">
              <p className="text-sm font-medium mb-2">Switching to "{requestedName}" will:</p>
              <ul className="text-sm space-y-1">
                <li>• Stop syncing to {currentName}</li>
                <li>• Start syncing to {requestedName}</li>
                <li>• Keep {currentName} isolated from future changes</li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelSwitch} disabled={isProcessing}>
            Keep Current
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmSwitch}
            disabled={isProcessing}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isProcessing ? 'Switching...' : `Switch to ${requestedName}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
