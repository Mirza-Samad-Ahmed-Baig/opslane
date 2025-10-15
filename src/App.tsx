import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Plus, AlertCircle, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SessionList } from '@/components/SessionList';
import { NewSessionDialog } from '@/components/NewSessionDialog';
import { ComponentShowcase } from '@/pages/ComponentShowcase';
import { queryClient } from '@/lib/query-client';
import { useDockerStatus } from '@/hooks';
import { logger } from './utils/logger';
import './App.css';

function HomePage() {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const { data: dockerAvailable } = useDockerStatus();

  // Register global shortcuts
  useEffect(() => {
    const setupShortcuts = async () => {
      try {
        // Register Cmd+N / Ctrl+N for new session
        await register('CommandOrControl+N', async (event) => {
          if (event.state === 'Pressed') {
            // Focus window if not focused
            const window = getCurrentWebviewWindow();
            await window.setFocus();
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
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
            <Button onClick={() => setShowNewDialog(true)} title="New Session (⌘N)">
              <Plus className="mr-2 h-4 w-4" />
              New Session
            </Button>
          </div>
        </div>
      </header>

      {/* Docker Warning Banner */}
      {!dockerAvailable && (
        <div className="border-b bg-yellow-50 border-yellow-200">
          <div className="container mx-auto px-6 py-3 flex items-center gap-2 text-sm text-yellow-800">
            <AlertCircle className="h-4 w-4" />
            <span>Docker is not running. Start Docker to create sessions.</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <SessionList onCreateClick={() => setShowNewDialog(true)} />
      </main>

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
          <Route path="/showcase" element={<ComponentShowcase />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
