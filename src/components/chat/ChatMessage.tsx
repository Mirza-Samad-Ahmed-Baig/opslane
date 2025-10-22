import type { DisplayMessage, ImageAttachment } from '@/types/messages';
import { useState, useMemo, useCallback } from 'react';
import { User, Bot, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { markdownComponents } from '@/components/ui/markdown';

interface ChatMessageProps {
  message: DisplayMessage;
}

// Validate image path to prevent directory traversal attacks
const isValidImagePath = (path: string): boolean => {
  // Prevent directory traversal
  if (path.includes('../') || path.includes('..\\')) {
    console.warn('Invalid image path detected (directory traversal):', path);
    return false;
  }
  // Ensure path starts with expected container mount
  if (!path.startsWith('/workspace/images/')) {
    console.warn('Invalid image path detected (outside workspace):', path);
    return false;
  }
  return true;
};

// Resolve image source with proper type narrowing and validation
const resolveImageSource = (image: ImageAttachment): string => {
  try {
    if (image.source.type === 'base64') {
      return image.source.data;
    } else if (image.source.type === 'path') {
      if (!isValidImagePath(image.source.path)) {
        return '';
      }
      return convertFileSrc(image.source.path);
    }
    return '';
  } catch (error) {
    console.error('Failed to resolve image source:', error);
    return '';
  }
};

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());

  // Memoize image sources to avoid recalculation on every render
  const imageSources = useMemo(
    () => message.images?.map((img) => resolveImageSource(img)) || [],
    [message.images]
  );

  // Handle image load errors
  const handleImageError = useCallback((index: number) => {
    setFailedImages((prev) => new Set(prev).add(index));
  }, []);

  // Handle image click with keyboard support
  const handleImageClick = useCallback((index: number) => {
    setSelectedImageIndex(index);
    setIsImageModalOpen(true);
  }, []);

  const handleImageKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleImageClick(index);
      }
    },
    [handleImageClick]
  );

  // Render images if present
  const renderImages = () => {
    if (!message.images || message.images.length === 0) return null;

    return (
      <div className="flex gap-2 mt-2 flex-wrap">
        {message.images.map((_, idx) => {
          const src = imageSources[idx];
          if (!src) return null;

          const hasFailed = failedImages.has(idx);

          return (
            <div
              key={idx}
              role="button"
              tabIndex={0}
              className={cn(
                'max-h-60 rounded border overflow-hidden',
                'cursor-pointer hover:opacity-80 transition-opacity',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
              )}
              onClick={() => handleImageClick(idx)}
              onKeyDown={(e) => handleImageKeyDown(e, idx)}
              aria-label={`View image attachment ${idx + 1}`}
            >
              {hasFailed ? (
                <div className="flex items-center justify-center w-40 h-40 bg-muted">
                  <ImageOff className="h-8 w-8 text-muted-foreground" />
                </div>
              ) : (
                <img
                  src={src}
                  alt={`Image attachment ${idx + 1} from ${message.role}`}
                  className="max-h-60 object-contain"
                  onError={() => handleImageError(idx)}
                  loading="lazy"
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const hasContent =
    (message.text && message.text.trim().length > 0) ||
    (message.images && message.images.length > 0);

  return (
    <div
      className={cn(
        'flex gap-3 p-4 rounded-lg animate-fadeIn mb-4', // Calm animation (200ms fade), mb-4 for consistent spacing
        isUser ? 'bg-primary/10 ml-12' : 'bg-muted/50 mr-12'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary' : 'bg-muted'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary-foreground" />
        ) : (
          <Bot className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1">
        {/* Text content */}
        {message.text && message.text.trim().length > 0 && (
          <div
            className={cn(
              'prose prose-base dark:prose-invert max-w-none',
              // Remove internal spacing - components handle it
              '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0'
            )}
          >
            {isUser ? (
              // User messages stay as plain text but with better typography
              <p className="text-base leading-relaxed mb-0">{message.text}</p>
            ) : (
              // Assistant messages get full markdown rendering
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {message.text}
              </ReactMarkdown>
            )}
          </div>
        )}

        {/* Image attachments */}
        {renderImages()}

        {/* Tools are now rendered separately by MessagePanel via ToolMessageGroup */}
        {/* This keeps text-only messages clean and allows proper grouping */}

        {/* Show "No content" only if truly empty */}
        {!hasContent && (
          <div className="text-sm text-muted-foreground/60 italic">No displayable content</div>
        )}
      </div>

      {/* Full-size image modal */}
      {message.images && message.images.length > 0 && (
        <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
          <DialogContent className="max-w-4xl">
            {(() => {
              const src = imageSources[selectedImageIndex];
              if (!src) return null;

              const hasFailed = failedImages.has(selectedImageIndex);

              return (
                <div className="flex items-center justify-center">
                  {hasFailed ? (
                    <div className="flex flex-col items-center justify-center gap-4 p-12">
                      <ImageOff className="h-16 w-16 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Failed to load image</p>
                    </div>
                  ) : (
                    <img
                      src={src}
                      alt={`Full size image ${selectedImageIndex + 1} from ${message.role}`}
                      className="w-full h-auto max-h-[80vh] object-contain"
                      onError={() => handleImageError(selectedImageIndex)}
                    />
                  )}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
