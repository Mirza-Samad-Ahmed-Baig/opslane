import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Circle, Trash2, Loader2, FileText, ArrowUpDown, XCircle } from 'lucide-react';
import type { Session } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ContainerLogsDialog } from '../ContainerLogsDialog';
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
import { SessionStatusBadge } from '../SessionStatusBadge';
import { EnableSyncConfirmation } from './EnableSyncConfirmation';
import { useDeleteSession } from '@/hooks';
import { useActiveSync } from '@/hooks/useActiveSync';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface SessionCardWithSyncProps {
  session: Session;
}

/**
 * Enhanced SessionCard with two-way sync capabilities
 * Design Principles #2, #7: Instant Feedback, Contextual Actions
 */
export function SessionCardWithSync({ session }: SessionCardWithSyncProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const deleteSession = useDeleteSession();
  const { isSessionActive, enableSync, stopSync, loading } = useActiveSync(session.project_id);

  const isActive = isSessionActive(session.id);

  const handleDelete = () => {
    deleteSession.mutate(session.id);
    setShowDeleteDialog(false);
  };

  const handleEnableSync = () => {
    setShowSyncConfirm(true);
  };

  const handleConfirmSync = () => {
    enableSync(session.id, session.name);
    setShowSyncConfirm(false);
  };

  const handleStopSync = () => {
    stopSync();
  };

  return (
    <>
      <div onMouseEnter={() => setShowActions(true)} onMouseLeave={() => setShowActions(false)}>
        <Card
          className={cn(
            'group relative transition-all duration-200',
            // Subtle visual difference for active session (Principle #10)
            isActive &&
              'ring-1 ring-amber-400/50 dark:ring-amber-600/50 bg-amber-50/10 dark:bg-amber-950/10'
          )}
        >
          {/* Active indicator - persistent but calm */}
          {isActive && (
            <div className="absolute top-2 right-2 z-10">
              <Badge
                variant="outline"
                className="bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-amber-400 dark:border-amber-600 text-xs font-medium"
              >
                <Circle className="w-2 h-2 fill-current mr-1 animate-pulse" />
                Syncing
              </Badge>
            </div>
          )}

          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base">{session.name}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <SessionStatusBadge status={session.status} />
                  <span className="text-xs text-muted-foreground">
                    Branch: {session.base_branch}
                  </span>
                </div>
              </div>

              <div
                className="flex gap-1"
                onClick={(e) => e.preventDefault()} // Prevent navigation on button clicks
              >
                {/* Contextual actions on hover (Principle #7) */}
                <div
                  className={cn(
                    'flex gap-1 transition-opacity',
                    showActions ? 'opacity-100' : 'opacity-0'
                  )}
                >
                  {session.status === 'ready' && (
                    <>
                      {isActive ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleStopSync}
                          disabled={loading}
                          className="h-8 w-8"
                          aria-label="Stop syncing this session"
                          title="Stop sync"
                        >
                          {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleEnableSync}
                          disabled={loading}
                          className="h-8 w-8"
                          aria-label="Enable two-way sync for this session"
                          title="Enable sync"
                        >
                          {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowUpDown className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowLogsDialog(true)}
                    className="h-8 w-8"
                    aria-label="View container logs"
                    title="View logs"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={deleteSession.isPending}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label="Delete this session"
                    title="Delete session"
                  >
                    {deleteSession.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {/* Session details */}
            <div className="space-y-2 text-xs text-muted-foreground">
              {session.session_repo_path && (
                <div className="font-mono truncate">{session.session_repo_path}</div>
              )}

              {session.container_id && (
                <div className="truncate">
                  Container: {session.container_name || session.container_id.slice(0, 12)}
                </div>
              )}

              {/* Sync status for active session */}
              {isActive && session.sync_activated_at && (
                <div className="text-amber-800 dark:text-amber-300 font-medium">
                  Syncing for {formatDistanceToNow(new Date(session.sync_activated_at))}
                </div>
              )}

              {/* Error message */}
              {session.error_message && (
                <div className="text-destructive text-xs mt-2 p-2 bg-destructive/10 rounded">
                  {session.error_message}
                </div>
              )}
            </div>

            {/* Action buttons (visible on hover or when active) */}
            <div
              className={cn(
                'flex gap-2 mt-4 transition-opacity',
                showActions || isActive ? 'opacity-100' : 'opacity-0'
              )}
            >
              {session.status === 'ready' && (
                <Link to={`/session/${session.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    Open Chat
                  </Button>
                </Link>
              )}

              {session.status === 'ready' && (
                <>
                  {isActive ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStopSync}
                      disabled={loading}
                      className="flex-1 border-amber-500 text-amber-800 font-medium hover:bg-amber-50 dark:border-amber-500 dark:text-amber-200 dark:hover:bg-amber-950"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Stopping...
                        </>
                      ) : (
                        'Stop Sync'
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleEnableSync}
                      disabled={loading}
                      className="flex-1"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Enabling...
                        </>
                      ) : (
                        'Enable Sync'
                      )}
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <EnableSyncConfirmation
        session={session}
        open={showSyncConfirm}
        onConfirm={handleConfirmSync}
        onCancel={() => setShowSyncConfirm(false)}
      />

      <ContainerLogsDialog
        sessionId={session.id}
        sessionName={session.name}
        open={showLogsDialog}
        onOpenChange={setShowLogsDialog}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{session.name}"? This will stop the container and
              remove all session data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
