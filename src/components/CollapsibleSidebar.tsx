import { useState, useEffect, ReactNode } from 'react';
import { ChevronLeft, ChevronRight, List, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface CollapsibleSidebarProps {
  children: ReactNode;
  defaultCollapsed?: boolean;
  storageKey?: string;
  className?: string;
  mobileTitle?: string; // Title for mobile drawer
  mobileOpen?: boolean; // Control mobile drawer from parent
  onMobileOpenChange?: (open: boolean) => void; // Callback for mobile open state
}

/**
 * CollapsibleSidebar - A responsive sidebar that can be collapsed/expanded
 *
 * Features:
 * - Auto-collapses on mobile (< 768px)
 * - Persistent state via localStorage
 * - Smooth transitions
 * - Toggle button in header
 * - Collapsed state shows as thin bar with expand button
 */
export function CollapsibleSidebar({
  children,
  defaultCollapsed = false,
  storageKey = 'sidebar-collapsed',
  className,
  mobileTitle = 'Navigation',
  mobileOpen = false,
  onMobileOpenChange,
}: CollapsibleSidebarProps) {
  // Track viewport width
  const [viewportWidth, setViewportWidth] = useState(() => {
    return typeof window !== 'undefined' ? window.innerWidth : 1920;
  });

  // Determine viewport category
  const getViewportCategory = (width: number): 'mobile' | 'small' | 'large' => {
    if (width < 768) return 'mobile';
    if (width < 1280) return 'small';
    return 'large';
  };

  // Track user's manual preference per viewport category
  const [userPreference, setUserPreference] = useState<boolean | null>(() => {
    // Only load preference if we're on a large screen
    const currentCategory = getViewportCategory(
      typeof window !== 'undefined' ? window.innerWidth : 1920
    );

    if (currentCategory === 'large' && storageKey) {
      const stored = localStorage.getItem(`${storageKey}-large`);
      if (stored !== null) {
        return stored === 'true';
      }
    }

    return null; // null means no user preference set yet
  });

  // Update viewport width on resize
  useEffect(() => {
    const handleResize = () => {
      const newWidth = window.innerWidth;
      const oldCategory = getViewportCategory(viewportWidth);
      const newCategory = getViewportCategory(newWidth);

      setViewportWidth(newWidth);

      // Clear user preference when crossing from large to small or vice versa
      if (oldCategory !== newCategory) {
        if (newCategory === 'large') {
          // Moving to large screen - load large screen preference
          const stored = localStorage.getItem(`${storageKey}-large`);
          setUserPreference(stored !== null ? stored === 'true' : null);
        } else {
          // Moving to small screen - clear preference (auto-collapse)
          setUserPreference(null);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [viewportWidth, storageKey]);

  // Determine if should be collapsed based on viewport and user preference
  const isCollapsed = (() => {
    const category = getViewportCategory(viewportWidth);

    // Large screens (>= 1280px): Use user preference or default to expanded
    if (category === 'large') {
      return userPreference ?? defaultCollapsed;
    }

    // Small/Medium screens (768px - 1279px): Auto-collapse by default
    // Respect user's temporary manual toggle during session
    if (category === 'small') {
      return userPreference ?? true; // Default to collapsed
    }

    // Mobile (< 768px): Always collapsed (hidden via CSS)
    return true;
  })();

  // Persist user preference to localStorage (only for large screens)
  useEffect(() => {
    const category = getViewportCategory(viewportWidth);

    if (storageKey && userPreference !== null && category === 'large') {
      localStorage.setItem(`${storageKey}-large`, String(userPreference));
    }
  }, [userPreference, storageKey, viewportWidth]);

  const toggleCollapsed = () => {
    // Store the user's explicit choice
    setUserPreference(!isCollapsed);
  };

  // Keyboard shortcut: Cmd/Ctrl+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleCollapsed();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCollapsed]); // Include isCollapsed so toggleCollapsed has current state

  return (
    <>
      {/* Desktop/Tablet Sidebar */}
      <div
        className={cn(
          'hidden md:flex h-full flex-col border-r bg-muted/30 flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden',
          isCollapsed ? 'w-12' : 'md:w-[280px] lg:w-80',
          className
        )}
        role="navigation"
        aria-label="Session navigation"
        aria-expanded={!isCollapsed}
      >
        {/* Header with toggle button - consistent position */}
        <div className={cn(
          'flex-shrink-0 flex items-center border-b',
          isCollapsed ? 'flex-col gap-2 py-3' : 'justify-end px-2 py-2'
        )}>
          {/* Icon hint when collapsed */}
          {isCollapsed && (
            <div className="text-muted-foreground" aria-hidden="true">
              <List className="h-4 w-4" />
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            title={isCollapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="h-8 w-8"
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Content - only render when expanded */}
        {!isCollapsed && (
          <div className="flex-1 overflow-hidden">{children}</div>
        )}
      </div>

      {/* Mobile Dialog */}
      <Dialog open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DialogContent className="h-[85vh] max-w-[90vw] p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle>{mobileTitle}</DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Export a mobile menu button for use in headers
export function MobileSidebarButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className="md:hidden h-8 w-8"
      aria-label="Open navigation menu"
    >
      <Menu className="h-5 w-5" />
    </Button>
  );
}
