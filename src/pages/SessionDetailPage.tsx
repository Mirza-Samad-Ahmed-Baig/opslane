import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/useSession';
import { SessionList } from '@/components/SessionList';
import { MessagePanel } from '@/components/MessagePanel';
import { DiffViewer } from '@/components/DiffViewer';
import { SessionStatusBadge } from '@/components/SessionStatusBadge';
import { logger } from '@/utils/logger';
import type { DisplayMessage } from '@/types/messages';

/**
 * SessionDetailPage - Three-column layout for session detail view
 *
 * Layout:
 * - Left: Session list (same as home page)
 * - Center: Message panel (chat interface)
 * - Right: Diff viewer (file changes)
 *
 * Features:
 * - Esc key to return to home
 * - Loading skeleton while data loads
 * - Error state with retry button
 */
export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: session, isLoading, error } = useSession(id!);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  // Determine if session is setting up based on actual status
  const isSettingUp = session && session.status !== 'ready' && session.status !== 'error';

  // Get status-specific message with details
  const getStatusMessage = (status: string): { message: string; detail: string } => {
    switch (status) {
      case 'created':
        return {
          message: 'Initializing session...',
          detail: 'Setting up your isolated development environment',
        };
      case 'copying':
        return {
          message: 'Copying repository...',
          detail: 'This may take a moment for large repos',
        };
      case 'creating':
        return {
          message: 'Creating isolated container...',
          detail: 'Setting up Docker environment',
        };
      case 'starting':
        return {
          message: 'Starting container...',
          detail: 'Launching isolated workspace',
        };
      case 'configuring':
        return {
          message: 'Configuring Claude credentials...',
          detail: 'Setting up secure access',
        };
      case 'ready':
        return {
          message: 'Ready!',
          detail: 'Your session is ready to use',
        };
      default:
        return {
          message: 'Setting up session...',
          detail: 'This usually takes 2-5 seconds',
        };
    }
  };

  // Phase 1: Create optimistic message from session.initial_message
  // This provides instant feedback while container is being set up in the background
  const optimisticMessage = useMemo((): DisplayMessage | null => {
    if (!session?.initial_message) return null;

    return {
      id: 'optimistic-initial',
      uuid: 'optimistic-initial',
      role: 'user',
      text: session.initial_message,
      tools: [],
      status: 'complete',
    };
  }, [session?.initial_message]);

  logger.debug('[SessionDetail] Session status', {
    sessionId: id,
    sessionStatus: session?.status,
    isSettingUp,
    hasOptimisticMessage: !!optimisticMessage,
  });

  // Keyboard shortcut: Esc to go back (only if no dialog is open)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        navigate('/');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  // Loading state (Design Principle #2: Instant Feedback)
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center" role="status" aria-live="polite">
        <div className="text-center space-y-3">
          <Loader2
            className="h-8 w-8 animate-spin mx-auto text-muted-foreground"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium">Loading session...</p>
            <p className="text-xs text-muted-foreground mt-1">Please wait</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state (Design Principle #3: Resilient by Default)
  if (error || !session) {
    return (
      <div className="h-screen flex items-center justify-center" role="alert" aria-live="assertive">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 mx-auto text-status-error-fg" aria-hidden="true" />
          <p className="text-status-error-fg">Session not found</p>
          <Button onClick={() => navigate('/')} autoFocus>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header with back button */}
      <header
        className="border-b px-6 py-3 flex items-center gap-4"
        aria-label="Session detail header"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          title="Back to Home (Esc)"
          autoFocus
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold">{session.name}</h1>
          <p className="text-xs text-muted-foreground truncate max-w-2xl">
            {session.base_branch} • {session.local_repo_path}
          </p>
        </div>
        <SessionStatusBadge status={session.status} />
      </header>

      {/* Setup progress banner */}
      {isSettingUp && (
        <div className="px-6 py-3 bg-muted/50 border-b">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{getStatusMessage(session.status).message}</p>
              <p className="text-xs text-muted-foreground">
                {getStatusMessage(session.status).detail}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error alert for failed sessions */}
      {session.status === 'error' && (
        <div
          className="px-6 py-4 bg-destructive/10 border-b border-destructive/30"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <AlertCircle
                className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-destructive">Session Setup Failed</h3>
                <p className="text-xs text-destructive/80 mt-1">
                  {session.error_message || 'An unknown error occurred during setup'}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 ml-7">
              <Button
                onClick={() => window.location.reload()}
                variant="default"
                size="sm"
                className="text-xs"
              >
                Try Again
              </Button>
              <Button
                onClick={() => setShowTroubleshooting(!showTroubleshooting)}
                variant="ghost"
                size="sm"
                className="text-xs gap-1"
              >
                {showTroubleshooting ? (
                  <>
                    <ChevronUp className="h-3 w-3" />
                    Hide troubleshooting tips
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    Show troubleshooting tips
                  </>
                )}
              </Button>
            </div>

            {/* Collapsible troubleshooting section */}
            {showTroubleshooting && (
              <div className="ml-7 p-3 bg-background/80 rounded-md text-xs space-y-2 border border-border">
                <p className="font-semibold text-foreground">Common issues:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Docker not running: Start Docker Desktop and try again</li>
                  <li>
                    Claude CLI not installed:{' '}
                    <code className="bg-muted px-1 py-0.5 rounded font-mono">
                      npm install -g @anthropic-ai/cli
                    </code>
                  </li>
                  <li>
                    Credentials not configured:{' '}
                    <code className="bg-muted px-1 py-0.5 rounded font-mono">claude auth</code>
                  </li>
                  <li>Port conflicts: Check if another session is using the same port</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Three-column layout (Design Principle #5: Progressive Disclosure) */}
      {/* BLOCKER FIX: Responsive layout for mobile/tablet/desktop */}
      <div
        className="flex-1 grid overflow-hidden
        grid-cols-1
        md:grid-cols-[minmax(180px,240px)_1fr]
        lg:grid-cols-[minmax(180px,240px)_1fr_minmax(320px,480px)]
      "
      >
        {/* Session list - hidden on mobile, visible on tablet+ */}
        <div className="hidden md:block h-full">
          <SessionList onCreateClick={() => navigate('/')} activeSessionId={session.id} />
        </div>

        {/* Message panel - always visible */}
        <MessagePanel
          sessionId={session.id}
          optimisticMessage={optimisticMessage}
          isSettingUp={isSettingUp}
        />

        {/* Diff viewer - hidden on mobile/tablet, visible on desktop */}
        <div className="hidden lg:block">
          <DiffViewer sessionId={session.id} />
        </div>
      </div>
    </div>
  );
}
