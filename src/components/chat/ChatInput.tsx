import { useState, useCallback, useRef } from 'react';
import { ArrowUp, X, Square } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '@/lib/utils';
import type { ImageAttachment, ImageMediaType } from '@/types/messages';

interface SelectedImage {
  file: File;
  preview: string; // Object URL for thumbnail
  containerPath?: string; // Path in container after copy
  base64?: string; // Base64 for clipboard images
  mediaType: string;
}

interface ChatInputProps {
  sessionId?: string; // Optional - undefined for quick start (no session yet)
  onSend: (message: string, images?: ImageAttachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
  isSending?: boolean; // Track if we're actively sending (for spinner)
  repositoryControl?: React.ReactNode; // Repository selector to render in bottom bar
  modelControl?: React.ReactNode; // Model selector to render in bottom bar
}

// File upload constraints
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// Textarea auto-expand configuration
const LINE_HEIGHT = 24; // Line height in pixels (matches Inter font default)
const PADDING_AND_BORDER = 16; // Total vertical padding
const MIN_ROWS = 3;
const MAX_ROWS = 10;

// Type guard for Tauri file with path property
interface TauriFile extends File {
  path: string;
}

const hasFilePath = (file: File): file is TauriFile => {
  return 'path' in file && typeof (file as TauriFile).path === 'string';
};

const validateImage = (file: File): string | null => {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Unsupported format: ${file.type}. Allowed: PNG, JPEG, GIF, WebP`;
  }
  if (file.size > MAX_SIZE) {
    return `Image too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 10MB)`;
  }
  return null;
};

export function ChatInput({
  sessionId,
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
  isSending = false,
  repositoryControl,
  modelControl,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState<number>(MIN_ROWS);
  const [announcement, setAnnouncement] = useState<string>(''); // For screen reader announcements
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand handler
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);

    // Auto-expand logic
    const textarea = e.target;

    // Reset height to get accurate scrollHeight
    textarea.style.height = 'auto';
    const contentHeight = textarea.scrollHeight;
    const rows = Math.min(
      MAX_ROWS,
      Math.max(MIN_ROWS, Math.ceil((contentHeight - PADDING_AND_BORDER) / LINE_HEIGHT))
    );

    setTextareaHeight(rows);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));

      for (const file of files) {
        const error = validateImage(file);
        if (error) {
          alert(error);
          continue;
        }

        try {
          // If we have a session, try to copy to session directory for path-based reference
          // Otherwise, always use base64
          if (sessionId && hasFilePath(file)) {
            // Tauri files have the path property - use it for efficient path-based references
            try {
              // Copy to session directory and get container path
              const containerPath = await invoke<string>('copy_image_to_session', {
                sessionId,
                sourcePath: file.path,
                filename: file.name,
              });

              const preview = URL.createObjectURL(file);

              setSelectedImages((prev) => {
                const updated = [
                  ...prev,
                  {
                    file,
                    preview,
                    containerPath,
                    mediaType: file.type,
                  },
                ];
                setAnnouncement(`Image ${file.name} added. ${updated.length} images attached.`);
                return updated;
              });
              continue;
            } catch (copyError) {
              console.error('[ChatInput] Failed to copy image to session:', copyError);
              // Fall through to base64 conversion
            }
          }

          // No session or no file path - use base64
          const reader = new FileReader();
          const preview = URL.createObjectURL(file);

          reader.onload = () => {
            const base64 = reader.result as string;

            setSelectedImages((prev) => {
              const updated = [
                ...prev,
                {
                  file,
                  preview,
                  base64,
                  mediaType: file.type,
                },
              ];
              setAnnouncement(`Image ${file.name} added. ${updated.length} images attached.`);
              return updated;
            });
          };

          reader.onerror = () => {
            console.error('[ChatInput] FileReader error for file:', file.name);
            URL.revokeObjectURL(preview); // Clean up on error
            alert('Failed to process image. Please try again.');
          };

          reader.readAsDataURL(file);
        } catch (err) {
          console.error('[ChatInput] Error adding image:', err);
          alert(`Failed to add image: ${err}`);
        }
      }
    },
    [sessionId]
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    console.log('[ChatInput] Paste event:', {
      itemCount: items.length,
      types: items.map((item) => item.type),
    });

    const imageItem = items.find((item) => item.type.startsWith('image/'));

    if (!imageItem) {
      console.log('[ChatInput] No image item found in paste');
      return;
    }

    // Prevent default IMMEDIATELY to stop text paste
    console.log('[ChatInput] Image item found:', imageItem.type);
    e.preventDefault();
    e.stopPropagation();

    const file = imageItem.getAsFile();
    if (!file) {
      console.error('[ChatInput] Failed to get file from image item');
      return;
    }

    const error = validateImage(file);
    if (error) {
      alert(error);
      return;
    }

    try {
      // Convert to base64 for clipboard images
      const reader = new FileReader();
      const preview = URL.createObjectURL(file);

      reader.onload = () => {
        const base64 = reader.result as string;

        setSelectedImages((prev) => {
          const updated = [
            ...prev,
            {
              file,
              preview,
              base64,
              mediaType: file.type,
            },
          ];
          setAnnouncement(`Image pasted. ${updated.length} images attached.`);
          return updated;
        });
      };

      reader.onerror = () => {
        console.error('[ChatInput] FileReader error for pasted file:', file.name);
        URL.revokeObjectURL(preview); // Clean up on error
        alert('Failed to process pasted image. Please try again.');
      };

      reader.readAsDataURL(file);
    } catch (err) {
      console.error('[ChatInput] Error processing paste:', err);
      alert(`Failed to process pasted image: ${err}`);
    }
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    setSelectedImages((prev) => {
      const updated = [...prev];
      const removed = updated[index];
      if (removed) {
        URL.revokeObjectURL(removed.preview); // Clean up object URL
      }
      updated.splice(index, 1);
      setAnnouncement(
        `Image ${removed?.file.name || ''} removed. ${updated.length} ${updated.length === 1 ? 'image' : 'images'} remaining.`
      );
      return updated;
    });
  }, []);

  const handleCancel = useCallback(async () => {
    if (!sessionId) return;

    // Take a snapshot for cleanup to avoid state-related race conditions
    const imagesToCleanup = [...selectedImages];
    setSelectedImages([]); // Clear state first

    // Then clean up URLs
    imagesToCleanup.forEach((img) => URL.revokeObjectURL(img.preview));

    try {
      await invoke('cancel_message_generation', { sessionId });
      // State will be updated via event listener in useChatMessages
    } catch (err) {
      console.error('Failed to cancel message generation:', err);
      alert('Failed to stop generation. Please try again.');
    }
  }, [sessionId, selectedImages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    if (!value.trim() && selectedImages.length === 0) return;

    // Convert to ImageAttachment format
    const images: ImageAttachment[] = selectedImages.map((img) => ({
      source: img.containerPath
        ? {
            type: 'path' as const,
            path: img.containerPath,
            media_type: img.mediaType as ImageMediaType,
          }
        : {
            type: 'base64' as const,
            data: img.base64!,
            media_type: img.mediaType as ImageMediaType,
          },
    }));

    onSend(value.trim(), images.length > 0 ? images : undefined);
    setValue('');
    setTextareaHeight(MIN_ROWS); // Reset to minimum height

    // Clean up previews
    selectedImages.forEach((img) => URL.revokeObjectURL(img.preview));
    setSelectedImages([]);
    setAnnouncement('Message sent.');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'border rounded-xl overflow-hidden bg-background shadow-sm',
        'transition-shadow duration-200 hover:shadow-md',
        'focus-within:shadow-lg focus-within:border-primary/30',
        isDragging && 'ring-2 ring-primary'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Main textarea area */}
      <div className="p-4 pb-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          variant="filled"
          className="resize-none p-0 min-h-[120px]"
          rows={textareaHeight}
          autoFocus
          aria-label="Chat message input"
          aria-describedby="chat-input-hint"
        />
      </div>

      {/* Image Previews */}
      {selectedImages.length > 0 && (
        <div
          className="flex gap-2 px-4 pb-2 flex-wrap animate-fadeIn"
          role="list"
          aria-label="Attached images"
        >
          {selectedImages.map((img, idx) => (
            <div key={idx} className="relative group animate-scaleIn" role="listitem">
              <img
                src={img.preview}
                alt={img.file.name}
                className="h-20 w-20 object-cover rounded border transition-all duration-150 hover:scale-105 hover:shadow-md"
              />
              <button
                type="button"
                onClick={() => handleRemoveImage(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault();
                    handleRemoveImage(idx);
                  }
                }}
                className={cn(
                  'absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1',
                  'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                )}
                aria-label={`Remove image ${img.file.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bottom controls bar */}
      <div className="flex items-center gap-2 px-4 pb-4 pt-2 border-t border-border/20">
        {/* Left side - Repository and Model controls */}
        <div className="flex items-center gap-2 flex-1">
          {repositoryControl}
          {modelControl}
        </div>

        {/* Right side - Send/Stop button */}
        <button
          type={isSending ? 'button' : 'submit'}
          onClick={isSending ? handleCancel : undefined}
          disabled={!isSending && (disabled || (!value.trim() && selectedImages.length === 0))}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 px-3 py-2',
            'rounded-lg text-sm font-medium transition-all duration-150',
            'hover:scale-[1.02] active:scale-[0.98]',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            // Dynamic styling based on state
            isSending
              ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
          aria-label={isSending ? 'Stop generation' : 'Send message'}
          aria-busy={isSending}
          title={isSending ? 'Stop generation' : 'Send message (Enter)'}
        >
          {isSending ? (
            <Square className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* ARIA live region for screen reader announcements */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {/* Screen reader hint */}
      <div id="chat-input-hint" className="sr-only">
        Press Enter to send, Shift+Enter for new line. Drag images or paste from clipboard.
      </div>
    </form>
  );
}
