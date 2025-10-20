import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { Palette, FolderOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SessionList } from '@/components/SessionList';
import { NewSessionDialog } from '@/components/NewSessionDialog';
import { ComponentShowcase } from '@/pages/ComponentShowcase';
import { SessionDetailPage } from '@/pages/SessionDetailPage';
import { queryClient } from '@/lib/query-client';
import { useDockerStatus, useCreateSession, useProjects, useGetOrCreateProject } from '@/hooks';
import type { SessionProgressEvent, NewSession } from '@/types/session';
import type { Project } from '@/types/project';
import { logger } from './utils/logger';
import './App.css';

function HomePage() {
  const navigate = useNavigate();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [quickStartMessage, setQuickStartMessage] = useState('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: dockerAvailable } = useDockerStatus();
  const { data: projects } = useProjects();
  const getOrCreateProject = useGetOrCreateProject();
  const createSession = useCreateSession();

  // Track if we're currently creating a session (for button feedback only)
  const [isCreating, setIsCreating] = useState(false);

  // Simplified Quick-start handler
  const handleQuickStart = async () => {
    logger.info('[App] handleQuickStart called', {
      hasMessage: !!quickStartMessage.trim(),
      hasProject: !!selectedProject,
      isCreating,
    });

    if (!quickStartMessage.trim() || !selectedProject || isCreating) {
      logger.warn('[App] handleQuickStart blocked', {
        reason: !quickStartMessage.trim()
          ? 'no message'
          : !selectedProject
            ? 'no project'
            : 'already creating',
      });
      setError(!selectedProject ? 'Please select a project directory' : 'Please enter a message');
      return;
    }

    setIsCreating(true);
    setError(null);

    const tempMessage = quickStartMessage.trim();

    logger.info('[App] Starting session creation', {
      message: tempMessage.slice(0, 50),
      projectId: selectedProject.id,
      projectName: selectedProject.name,
    });

    try {
      // Generate session name from message (first 50 chars)
      const sessionName = tempMessage.slice(0, 50);

      // Create session
      const newSession: NewSession = {
        project_id: selectedProject.id,
        name: sessionName,
        base_branch: 'main',
        initial_message: tempMessage,
      };

      const session = await createSession.mutateAsync({
        projectId: selectedProject.id,
        newSession,
      });

      logger.info('[App] Session created successfully', {
        sessionId: session.id,
        sessionStatus: session.status,
        name: session.name,
      });

      // Clear inputs
      setQuickStartMessage('');
      setSelectedProject(null);

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
        err.message || 'Failed to create session. Please check your settings and try again.'
      );
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && selectedProject) {
      e.preventDefault();
      handleQuickStart();
    }
  };

  // Open directory picker and create/get project
  const handleBrowseFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Project Directory',
      });

      if (selected && typeof selected === 'string') {
        // Get or create project for this path
        const project = await getOrCreateProject.mutateAsync(selected);
        setSelectedProject(project);
        setError(null);
      }
    } catch (error) {
      logger.error('Failed to open directory picker or create project', error as Error);
      setError('Failed to select directory');
    }
  };

  // Handle project selection from selector
  const handleProjectSelect = (project: Project) => {
    setSelectedProject(project);
    setError(null);
  };

  // Clear selection (go back to selector)
  const handleClearSelection = () => {
    setSelectedProject(null);
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
          <SessionList />
        </div>

        {/* Center Panel - Quick-start input */}
        <div className="flex-1 flex items-center justify-center bg-background">
          {/* Quick-start Input Form */}
          <div className="w-full max-w-4xl px-4 sm:px-8">
            <h2
              id="quickstart-heading"
              className="text-2xl sm:text-3xl font-semibold text-center mb-6 sm:mb-8"
            >
              What are we coding next?
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

            {/* Chat-style Input Box */}
            <div className="border-2 rounded-xl overflow-hidden bg-background shadow-sm">
              {/* Message Input */}
              <Textarea
                id="task-description"
                aria-labelledby="quickstart-heading"
                value={quickStartMessage}
                onChange={(e) => setQuickStartMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe a task"
                disabled={!dockerAvailable || isCreating}
                className="min-h-[200px] border-0 text-base resize-none p-6"
              />

              {/* Bottom Bar - Responsive */}
              <div className="border-t bg-muted/30 px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center gap-2 sm:gap-3">
                {/* Repository Selector */}
                {!selectedProject ? (
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (value === '__browse__') {
                        handleBrowseFolder();
                      } else if (value) {
                        const project = projects?.find((p) => p.id === value);
                        if (project) {
                          handleProjectSelect(project);
                        }
                      }
                    }}
                    disabled={getOrCreateProject.isPending}
                  >
                    <SelectTrigger className="w-full sm:flex-1">
                      <SelectValue placeholder="Select a repository..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projects && projects.length > 0 && (
                        <>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name}
                            </SelectItem>
                          ))}
                          <SelectItem
                            value="__separator__"
                            disabled
                            className="h-px bg-border my-1"
                          >
                            {/* Separator */}
                          </SelectItem>
                        </>
                      )}
                      <SelectItem value="__browse__">Browse for new project...</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="w-full sm:flex-1 flex items-center gap-2 px-3 py-2 border border-input bg-muted/50 rounded-md h-9">
                    <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium truncate flex-1">
                      {selectedProject.name}
                    </span>
                    <button
                      onClick={handleClearSelection}
                      className="text-xs text-muted-foreground hover:text-foreground underline flex-shrink-0"
                    >
                      Change
                    </button>
                  </div>
                )}

                {/* Model Selector */}
                <Select defaultValue="sonnet">
                  <SelectTrigger className="w-full sm:w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sonnet">Sonnet</SelectItem>
                    <SelectItem value="opus">Opus</SelectItem>
                    <SelectItem value="haiku">Haiku</SelectItem>
                  </SelectContent>
                </Select>

                {/* Start Button */}
                <Button
                  onClick={handleQuickStart}
                  disabled={
                    !quickStartMessage.trim() || !selectedProject || !dockerAvailable || isCreating
                  }
                  className="w-full sm:w-auto px-8"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    'Start'
                  )}
                </Button>
              </div>
            </div>
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
