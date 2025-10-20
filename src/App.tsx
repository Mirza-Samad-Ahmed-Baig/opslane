import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { Palette, Send, FolderOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { SessionList } from '@/components/SessionList';
import { NewSessionDialog } from '@/components/NewSessionDialog';
import { ComponentShowcase } from '@/pages/ComponentShowcase';
import { SessionDetailPage } from '@/pages/SessionDetailPage';
import { queryClient } from '@/lib/query-client';
import { useDockerStatus, useCreateSession } from '@/hooks';
import type { SessionProgressEvent } from '@/types/session';
import { logger } from './utils/logger';
import './App.css';

function HomePage() {
  const navigate = useNavigate();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [quickStartMessage, setQuickStartMessage] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data: dockerAvailable } = useDockerStatus();
  const createSession = useCreateSession();

  // Track if we're currently creating a session (for button feedback only)
  const [isCreating, setIsCreating] = useState(false);

  // Simplified Quick-start handler
  const handleQuickStart = async () => {
    logger.info('[App] handleQuickStart called', {
      hasMessage: !!quickStartMessage.trim(),
      hasPath: !!repoPath.trim(),
      isCreating,
    });

    if (!quickStartMessage.trim() || !repoPath.trim() || isCreating) {
      logger.warn('[App] handleQuickStart blocked', {
        reason: !quickStartMessage.trim()
          ? 'no message'
          : !repoPath.trim()
            ? 'no path'
            : 'already creating',
      });
      return;
    }

    setIsCreating(true);
    setError(null);

    const tempMessage = quickStartMessage.trim();
    const tempPath = repoPath.trim();

    logger.info('[App] Starting session creation', {
      message: tempMessage.slice(0, 50),
      path: tempPath,
    });

    try {
      const session = await createSession.mutateAsync({
        name: tempMessage.slice(0, 50),
        local_repo_path: tempPath,
        base_branch: 'main',
        initial_message: tempMessage,
      });

      logger.info('[App] Session created successfully', {
        sessionId: session.id,
        sessionStatus: session.status,
        name: session.name,
      });

      // Clear inputs
      setQuickStartMessage('');
      setRepoPath('');

      // Navigate immediately to chat - let SessionDetailPage handle setup state
      logger.info('[App] Navigating to session', {
        sessionId: session.id,
        status: session.status,
      });

      navigate(`/session/${session.id}`, {
        state: {
          initialMessage: tempMessage,
          isNewSession: true,
          // Pass true if not ready yet, so chat can show "Setting up..." indicator
          isSettingUp: session.status !== 'ready',
        },
      });

      // Clear creating flag
      setIsCreating(false);
    } catch (error) {
      const err = error as Error;
      logger.error('[App] Failed to create quick-start session', err);
      setError(
        err.message || 'Failed to create session. Please check your repository path and try again.'
      );
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && repoPath.trim()) {
      e.preventDefault();
      handleQuickStart();
    }
  };

  // Open directory picker
  const handleBrowseFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Project Directory',
      });

      if (selected && typeof selected === 'string') {
        setRepoPath(selected);
      }
    } catch (error) {
      logger.error('Failed to open directory picker', error as Error);
    }
  };

  // Simple event listener for logging progress events
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<SessionProgressEvent>('session-progress', (event) => {
        logger.debug('[App] Progress event', {
          status: event.payload.status,
          session_id: event.payload.session_id,
          message: event.payload.message,
        });
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // Register global shortcuts
  useEffect(() => {
    const setupShortcuts = async () => {
      try {
        // Register Cmd+N / Ctrl+N for new session
        await register('CommandOrControl+N', async (event) => {
          if (event.state === 'Pressed') {
            // Focus window if not focused (ignore permission errors)
            try {
              const window = getCurrentWebviewWindow();
              await window.setFocus();
            } catch (err) {
              // Silently ignore focus errors - window will still show dialog
              const error = err as Error;
              logger.debug('Could not set window focus', { error: error.message });
            }
            setShowNewDialog(true);
          }
        });

        logger.info('Keyboard shortcuts registered');
      } catch (error) {
        logger.error('Failed to register shortcuts', error as Error);
      }
    };

    setupShortcuts();

    // Cleanup on unmount
    return () => {
      unregisterAll().catch((e) => logger.error('Failed to unregister shortcuts', e));
    };
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b flex-shrink-0">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Opslane</h1>
            <p className="text-sm text-muted-foreground">Manage your Claude development sessions</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/showcase">
              <Button variant="ghost" size="icon" title="Component Showcase">
                <Palette className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Docker Warning Banner */}
      {!dockerAvailable && (
        <div className="border-b flex-shrink-0">
          <div className="container mx-auto px-6 py-3">
            <Alert variant="warning">Docker is not running. Start Docker to create sessions.</Alert>
          </div>
        </div>
      )}

      {/* Main Layout - Left nav + Center quick-start */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Navigation Panel - Session List - hidden on mobile, visible on tablet+ */}
        <div className="hidden md:flex w-60 flex-shrink-0 flex-col overflow-auto">
          <SessionList onCreateClick={() => setShowNewDialog(true)} />
        </div>

        {/* Center Panel - Quick-start input */}
        <div className="flex-1 flex items-center justify-center bg-background">
          {/* Quick-start Input Form */}
          <div className="w-full max-w-2xl px-8">
            <h2 className="text-2xl font-semibold text-center mb-6">
              What are we working on today?
            </h2>

            {/* Error Alert */}
            {error && (
              <Alert variant="error" className="mb-4">
                <div className="flex items-center justify-between">
                  <span>{error}</span>
                  <button
                    onClick={() => setError(null)}
                    className="text-xs underline hover:no-underline ml-4"
                  >
                    Dismiss
                  </button>
                </div>
              </Alert>
            )}

            {/* Repository Path Input */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-2 block">Project Repository Path</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  placeholder="/path/to/your/project"
                  disabled={!dockerAvailable || isCreating}
                  aria-describedby="form-status"
                  className="flex-1 px-3 py-2 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
                <Button
                  onClick={handleBrowseFolder}
                  disabled={!dockerAvailable || isCreating}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <FolderOpen className="h-4 w-4" />
                  Browse
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Click Browse to select your git repository folder
              </p>
            </div>

            {/* Message Input */}
            <div className="relative">
              <Textarea
                value={quickStartMessage}
                onChange={(e) => setQuickStartMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isCreating ? 'Creating session...' : 'Describe what you want to work on...'
                }
                disabled={!dockerAvailable || !repoPath.trim() || isCreating}
                aria-describedby="form-status"
                className="min-h-32 pr-12 text-base resize-none"
              />
              <Button
                onClick={handleQuickStart}
                disabled={
                  !quickStartMessage.trim() || !repoPath.trim() || !dockerAvailable || isCreating
                }
                size="icon"
                className="absolute bottom-3 right-3"
                title={isCreating ? 'Creating session...' : 'Start new session'}
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p
              id="form-status"
              className="text-xs text-muted-foreground text-center mt-3"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {isCreating
                ? 'Creating your session...'
                : !repoPath.trim()
                  ? 'Enter a repository path first'
                  : 'Press Enter to start a new session'}
            </p>
          </div>
        </div>
      </div>

      {/* New Session Dialog */}
      <NewSessionDialog open={showNewDialog} onOpenChange={setShowNewDialog} />
    </div>
  );
}

function App() {
  // Log app mount
  logger.info('Opslane application started');

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/session/:id" element={<SessionDetailPage />} />
          <Route path="/showcase" element={<ComponentShowcase />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
