import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Loader2, FileText } from 'lucide-react';
import type { Session } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ContainerLogsDialog } from './ContainerLogsDialog';
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
import { SessionStatusBadge } from './SessionStatusBadge';
import { useDeleteSession, useProject } from '@/hooks';

interface SessionCardProps {
  session: Session;
}

/**
 * SessionCard - Displays a single session with status and actions
 *
 * Features:
 * - Status badge with color coding
 * - Session metadata (name, branch, path, container)
 * - Delete action with confirmation
 * - Error message display if session failed
 */
export function SessionCard({ session }: SessionCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const deleteSession = useDeleteSession();
  const { data: project } = useProject(session.project_id);

  const handleDelete = () => {
    deleteSession.mutate(session.id);
    setShowDeleteDialog(false);
  };

  return (
    <>
      <Link to={`/session/${session.id}`} className="block">
        <Card className="group relative transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <CardTitle className="text-base font-semibold truncate">{session.name}</CardTitle>
                <SessionStatusBadge status={session.status} />
              </div>

              {/* Actions - visible on mobile, hover on desktop */}
              <div className="flex gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowLogsDialog(true);
                  }}
                  className="h-8 w-8 focus-standard"
                  title="View Container Logs"
                  aria-label={`View logs for ${session.name}`}
                >
                  <FileText className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                  disabled={deleteSession.isPending}
                  className="h-8 w-8 focus-standard"
                  title="Delete Session"
                  aria-label={`Delete session ${session.name}`}
                >
                  {deleteSession.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground font-medium">Branch</dt>
              <dd className="truncate">{session.base_branch}</dd>

              {project && (
                <>
                  <dt className="text-muted-foreground font-medium">Path</dt>
                  <dd className="truncate">{project.local_repo_path}</dd>
                </>
              )}

              {session.container_name && (
                <>
                  <dt className="text-muted-foreground font-medium">Container</dt>
                  <dd className="truncate">{session.container_name}</dd>
                </>
              )}
            </dl>

            {session.error_message && (
              <div className="text-status-error-fg text-xs">
                <span className="font-medium">Error:</span> {session.error_message}
              </div>
            )}

            {session.last_sync_at && (
              <div className="text-xs text-muted-foreground/70">
                Last synced: {new Date(session.last_sync_at).toLocaleString()}
              </div>
            )}
          </CardContent>
        </Card>
      </Link>

      {/* Dialogs */}
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
              Are you sure you want to delete session "{session.name}"? This action cannot be
              undone. The Docker container will be stopped and removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
