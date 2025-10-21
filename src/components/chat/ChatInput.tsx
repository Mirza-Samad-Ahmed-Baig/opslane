import { useState, useCallback, useRef } from 'react';
import { Send, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { invoke } from '@tauri-apps/api/core';
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
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

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
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

              setSelectedImages((prev) => [
                ...prev,
                {
                  file,
                  preview,
                  containerPath,
                  mediaType: file.type,
                },
              ]);
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

            setSelectedImages((prev) => [
              ...prev,
              {
                file,
                preview,
                base64,
                mediaType: file.type,
              },
            ]);
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

        setSelectedImages((prev) => [
          ...prev,
          {
            file,
            preview,
            base64,
            mediaType: file.type,
          },
        ]);
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
      return updated;
    });
  }, []);

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

    // Clean up previews
    selectedImages.forEach((img) => URL.revokeObjectURL(img.preview));
    setSelectedImages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t p-4">
      {/* Image Previews */}
      {selectedImages.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {selectedImages.map((img, idx) => (
            <div key={idx} className="relative group">
              <img
                src={img.preview}
                alt={img.file.name}
                className="h-20 w-20 object-cover rounded border"
              />
              <button
                type="button"
                onClick={() => handleRemoveImage(idx)}
                className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove image"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={`flex gap-2 ${isDragging ? 'ring-2 ring-primary rounded-md' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          className="resize-none"
          rows={3}
          autoFocus
          aria-label="Chat message input"
          aria-describedby="chat-input-hint"
        />
        <Button
          type="submit"
          disabled={disabled || (!value.trim() && selectedImages.length === 0)}
          size="icon"
          className="self-end"
          aria-label="Send message"
        >
          {disabled ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-label="Sending" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div id="chat-input-hint" className="text-xs text-muted-foreground mt-2">
        Press Enter to send, Shift+Enter for new line. Drag images or paste from clipboard.
      </div>
    </form>
  );
}
