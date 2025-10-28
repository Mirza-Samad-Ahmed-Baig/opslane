import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minimize2, Maximize2, X } from 'lucide-react';
import { Button } from './ui/button';
import { isMacOS } from '../utils/platform';
import { useEffect, useState } from 'react';

/**
 * Custom window control buttons for Windows and Linux.
 * On macOS, returns null since traffic lights are used instead.
 */
export function WindowControls() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(isMacOS());
  }, []);

  // Don't render on macOS (uses native traffic lights)
  if (isMac) return null;

  const currentWindow = getCurrentWindow();

  const handleMinimize = () => {
    currentWindow.minimize();
  };

  const handleMaximize = () => {
    currentWindow.toggleMaximize();
  };

  const handleClose = () => {
    currentWindow.close();
  };

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Window controls">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleMinimize}
        className="h-8 w-8"
        title="Minimize window"
        aria-label="Minimize window"
      >
        <Minimize2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleMaximize}
        className="h-8 w-8"
        title="Maximize window"
        aria-label="Maximize window"
      >
        <Maximize2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClose}
        className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground"
        title="Close window"
        aria-label="Close window"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
