import { useState } from 'react';
import { Link } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { Trash2, Loader2, Terminal, FileText } from 'lucide-react';
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
import { useDeleteSession } from '@/hooks';

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
  const [isHovered, setIsHovered] = useState(false);
  const deleteSession = useDeleteSession();

  const handleDelete = () => {
    deleteSession.mutate(session.id);
    setShowDeleteDialog(false);
  };

  const handleOpenTerminal = async () => {
    try {
      await invoke('open_container_terminal', { sessionId: session.id });
    } catch (error) {
      console.error('Failed to open terminal:', error);
    }
  };

  return (
    <>
      <Link to={`/session/${session.id}`} className="block">
        <Card
          className="relative transition-all hover:shadow-lg border-border/50"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <div className="space-y-1 flex-1">
              <CardTitle className="text-lg font-semibold">{session.name}</CardTitle>
              <SessionStatusBadge status={session.status} />
            </div>

            {/* Actions - only show on hover */}
            {isHovered && (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowLogsDialog(true);
                  }}
                  className="h-8 w-8"
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
                    handleOpenTerminal();
                  }}
                  className="h-8 w-8"
                  title="Open in Terminal"
                  aria-label={`Open terminal for ${session.name}`}
                >
                  <Terminal className="h-4 w-4" />
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
                  className="h-8 w-8"
                  aria-label={`Delete session ${session.name}`}
                >
                  {deleteSession.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div>
                <span className="font-medium">Branch:</span> {session.base_branch}
              </div>
              <div className="truncate">
                <span className="font-medium">Path:</span> {session.local_repo_path}
              </div>
              {session.container_name && (
                <div className="truncate">
                  <span className="font-medium">Container:</span> {session.container_name}
                </div>
              )}
              {session.error_message && (
                <div className="text-status-error-fg text-xs mt-2">
                  <span className="font-medium">Error:</span> {session.error_message}
                </div>
              )}
            </div>
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
