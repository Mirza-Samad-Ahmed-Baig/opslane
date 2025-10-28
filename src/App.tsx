import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChatInput } from '@/components/chat/ChatInput';
import { SessionList } from '@/components/SessionList';
import { CompactRepositoryBadge } from '@/components/CompactRepositoryBadge';
import { HeaderSyncStatus } from '@/components/sync/HeaderSyncStatus';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { ComponentShowcase } from '@/pages/ComponentShowcase';
import { SessionDetailPage } from '@/pages/SessionDetailPage';
import { useDockerStatus, useCreateSession, useProjects, useGetOrCreateProject } from '@/hooks';
import type { SessionProgressEvent, NewSession } from '@/types/session';
import type { Project } from '@/types/project';
import type { ImageAttachment, ContentBlockInput } from '@/types/messages';
import { logger } from './utils/logger';
import { toastPatterns } from '@/lib/toast-patterns';
import { checkNotificationPermission } from '@/utils/notifications';
import { isMacOS } from '@/utils/platform';
import { WindowControls } from '@/components/WindowControls';
import './App.css';

function HomePage() {
  const navigate = useNavigate();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('sonnet');
  const [error, setError] = useState<string | null>(null);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const { data: dockerAvailable } = useDockerStatus();
  const { data: projects } = useProjects();
  const getOrCreateProject = useGetOrCreateProject();
  const createSession = useCreateSession();

  // Use the first project for global sync status
  const primaryProject = projects?.[0];

  // Track if we're currently creating a session (for button feedback only)
  const [isCreating, setIsCreating] = useState(false);

  // Platform detection for titlebar
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(isMacOS());
  }, []);

  // Quick-start handler - now accepts images from ChatInput
  const handleQuickStart = async (message: string, images?: ImageAttachment[]) => {
    logger.info('[App] handleQuickStart called', {
      hasMessage: !!message.trim(),
      hasProject: !!selectedProject,
      hasImages: images?.length || 0,
      isCreating,
    });

    if (!message.trim() || !selectedProject || isCreating) {
      logger.warn('[App] handleQuickStart blocked', {
        reason: !message.trim()
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

    const tempMessage = message.trim();

    logger.info('[App] Starting session creation', {
      message: tempMessage.slice(0, 50),
      projectId: selectedProject.id,
      projectName: selectedProject.name,
      imageCount: images?.length || 0,
    });

    // Build content blocks from message and images
    const contentBlocks: ContentBlockInput[] = [];

    if (tempMessage) {
      contentBlocks.push({
        type: 'text',
        text: tempMessage,
      });
    }

    if (images?.length) {
      images.forEach((img) => {
        contentBlocks.push({
          type: 'image',
          source: img.source,
        });
      });
    }

    try {
      // Generate session name from message (first 50 chars)
      const sessionName = tempMessage.slice(0, 50);

      // Create session (no initial_message field)
      const newSession: NewSession = {
        project_id: selectedProject.id,
        name: sessionName,
        base_branch: 'main',
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

      // Clear project selection (ChatInput clears its own state)
      setSelectedProject(null);

      // Navigate immediately to chat - let SessionDetailPage handle setup state
      logger.info('[App] Navigating to session', {
        sessionId: session.id,
        status: session.status,
      });

      navigate(`/session/${session.id}`, {
        state: {
          // Store content blocks for auto-send after session is ready
          initialContentBlocks: contentBlocks,
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

  // Open directory picker and create/get project
  const handleBrowseFolder = async () => {
    try {
      setIsBrowsing(true);
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
    } finally {
      setIsBrowsing(false);
    }
  };

  // Handle project selection from selector
  const handleProjectSelect = (project: Project) => {
    setSelectedProject(project);
    setError(null);
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

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b flex-shrink-0 titlebar-drag-region">
        <div
          className={`container mx-auto px-6 py-4 flex items-center justify-between ${isMac ? 'macos-traffic-lights-padding' : ''}`}
        >
          <div>
            <h1 className="text-2xl font-bold">Opslane</h1>
            <p className="text-sm text-muted-foreground">Manage your Claude development sessions</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Sync status badge - only shows when active */}
            {primaryProject && <HeaderSyncStatus projectId={primaryProject.id} />}

            <NotificationBell />

            <Link to="/showcase">
              <Button variant="ghost" size="icon" title="Component Showcase">
                <Palette className="h-4 w-4" />
              </Button>
            </Link>

            <WindowControls />
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
        <div className="hidden md:flex md:w-[280px] lg:w-80 flex-shrink-0 flex-col overflow-auto">
          <SessionList />
        </div>

        {/* Center Panel - Quick-start input */}
        <div className="flex-1 flex items-center justify-center bg-background">
          {/* Quick-start Input Form */}
          <div className="w-full max-w-3xl px-4 sm:px-8">
            <h2
              id="quickstart-heading"
              className="text-xl font-medium text-foreground/90 text-center mb-8 animate-fadeIn"
            >
              What would you like to build?
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

            {/* Chat Input with inline controls */}
            <ChatInput
              sessionId={undefined} // No session yet for quick start
              onSend={handleQuickStart}
              disabled={!selectedProject || !dockerAvailable || isCreating}
              isSending={isCreating}
              placeholder={
                !selectedProject
                  ? 'Select a repository first...'
                  : isCreating
                    ? 'Creating session...'
                    : 'Describe a task'
              }
              repositoryControl={
                <CompactRepositoryBadge
                  selectedProject={selectedProject}
                  projects={projects}
                  isBrowsing={isBrowsing}
                  isPending={getOrCreateProject.isPending}
                  onProjectSelect={handleProjectSelect}
                  onBrowseFolder={handleBrowseFolder}
                />
              }
              modelControl={
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/50 rounded-md border border-border/50 text-sm h-auto w-auto transition-all duration-150 hover:bg-muted/70 hover:border-border hover:scale-[1.02]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sonnet">Sonnet</SelectItem>
                    <SelectItem value="opus">Opus</SelectItem>
                    <SelectItem value="haiku">Haiku</SelectItem>
                  </SelectContent>
                </Select>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  // Log app mount
  logger.info('Opslane application started');

  // Listen for credential refresh errors on startup
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupCredentialErrorListener = async () => {
      unlisten = await listen<{ error: string; timestamp: string }>(
        'credential-refresh-error',
        (event) => {
          // Show error toast with actionable message
          toastPatterns.errorWithDescription(
            'Failed to refresh Claude credentials',
            event.payload.error
          );
          logger.warn('Credential refresh failed on startup', event.payload);
        }
      );
    };

    setupCredentialErrorListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // Check notification permission on app startup
  useEffect(() => {
    const checkPermission = async () => {
      const hasPermission = await checkNotificationPermission();

      if (hasPermission) {
        logger.info('[App] Notification permission granted');
      } else {
        logger.info(
          '[App] Notification permission not granted - notifications will be requested when needed'
        );
      }
    };

    checkPermission();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/session/:id" element={<SessionDetailPage />} />
        <Route path="/showcase" element={<ComponentShowcase />} />
      </Routes>

      {/* Removed: bottom sync status bar replaced with header badge */}
    </BrowserRouter>
  );
}

export default App;
