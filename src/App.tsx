import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { open } from '@tauri-apps/plugin-dialog';
import { Palette, Send, Loader2, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { SessionList } from '@/components/SessionList';
import { NewSessionDialog } from '@/components/NewSessionDialog';
import { ComponentShowcase } from '@/pages/ComponentShowcase';
import { SessionDetailPage } from '@/pages/SessionDetailPage';
import { queryClient } from '@/lib/query-client';
import { useDockerStatus, useCreateSession } from '@/hooks';
import { logger } from './utils/logger';
import './App.css';

function HomePage() {
  const navigate = useNavigate();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [quickStartMessage, setQuickStartMessage] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: dockerAvailable } = useDockerStatus();
  const createSession = useCreateSession();

  // Quick-start handler
  const handleQuickStart = async () => {
    if (!quickStartMessage.trim() || !repoPath.trim() || isCreating) return;

    setIsCreating(true);
    setError(null);

    try {
      const session = await createSession.mutateAsync({
        name: quickStartMessage.trim().slice(0, 50),
        local_repo_path: repoPath.trim(),
        base_branch: 'main',
        initial_message: quickStartMessage.trim(),
      });

      logger.info('Quick-start session created', { sessionId: session.id });

      // Navigate to session detail
      navigate(`/session/${session.id}`, {
        state: { initialMessage: quickStartMessage.trim() },
      });

      // Clear inputs
      setQuickStartMessage('');
      setRepoPath('');
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to create quick-start session', err);
      setError(
        err.message || 'Failed to create session. Please check your repository path and try again.'
      );
    } finally {
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
        {/* Left Navigation Panel - Session List */}
        <div className="w-60 flex-shrink-0 flex flex-col overflow-auto">
          <SessionList onCreateClick={() => setShowNewDialog(true)} />
        </div>

        {/* Center Panel - Quick-start input only */}
        <div className="flex-1 flex items-center justify-center bg-background">
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
                  disabled={isCreating || !dockerAvailable}
                  className="flex-1 px-3 py-2 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  onClick={handleBrowseFolder}
                  disabled={isCreating || !dockerAvailable}
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
                placeholder="Describe what you want to work on..."
                disabled={isCreating || !dockerAvailable || !repoPath.trim()}
                className="min-h-32 pr-12 text-base resize-none"
              />
              <Button
                onClick={handleQuickStart}
                disabled={
                  !quickStartMessage.trim() || !repoPath.trim() || isCreating || !dockerAvailable
                }
                size="icon"
                className="absolute bottom-3 right-3"
                title="Start new session"
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3">
              {!repoPath.trim()
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
