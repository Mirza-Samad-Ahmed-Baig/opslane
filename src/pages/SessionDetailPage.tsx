import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useMemo } from 'react';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
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

  // Determine if session is setting up based on actual status
  const isSettingUp = session && session.status !== 'ready' && session.status !== 'error';

  // Phase 1: Create optimistic message from session.initial_message
  // This provides instant feedback while container is being set up in the background
  const optimisticMessage = useMemo((): DisplayMessage | null => {
    if (!session?.initial_message) return null;

    return {
      id: 'optimistic-initial',
      uuid: 'optimistic-initial',
      role: 'user',
      text: session.initial_message,
      timestamp: session.created_at,
      tools: [],
      status: 'complete',
    };
  }, [session?.initial_message, session?.created_at]);

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
        <div className="text-center space-y-2">
          <Loader2
            className="h-8 w-8 animate-spin mx-auto text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">Loading session...</p>
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

      {/* Error alert for failed sessions */}
      {session.status === 'error' && session.error_message && (
        <Alert variant="error" className="mx-6 mt-4 mb-0">
          {session.error_message}
        </Alert>
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
        <div className="hidden md:block">
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
