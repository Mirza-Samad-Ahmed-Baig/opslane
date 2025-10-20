import { ReactNode } from 'react';
import type { ToolExecution } from '@/types/messages';

export interface ToolWidgetProps {
  tool: ToolExecution;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * Base utilities for all tool widgets
 * Provides common formatting, truncation, and duration helpers
 */
export const ToolWidgetUtils = {
  /**
   * Format duration in human-readable form
   * @param ms Duration in milliseconds
   * @returns Formatted string (e.g., "1.2s", "350ms")
   */
  formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
  },

  /**
   * Truncate file path intelligently
   * @param path Full file path
   * @param maxLength Maximum display length
   * @returns Truncated path with ellipsis
   */
  truncatePath(path: string, maxLength: number): string {
    if (path.length <= maxLength) return path;

    const parts = path.split('/');
    if (parts.length <= 2) {
      // Simple truncation for short paths
      return `...${path.slice(-(maxLength - 3))}`;
    }

    // Keep first and last parts, truncate middle
    const fileName = parts[parts.length - 1] || '';
    const remaining = maxLength - fileName.length - 7; // 7 for ".../"

    if (remaining < 0) {
      return `.../${fileName.slice(0, maxLength - 6)}...`;
    }

    return `.../${parts.slice(0, Math.ceil(remaining / 15)).join('/')}/${fileName}`;
  },

  /**
   * Format parameter value for display
   * @param value Parameter value (any type)
   * @returns Formatted string
   */
  formatParameter(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (typeof value === 'object') return `{${Object.keys(value).length} fields}`;
    return String(value);
  },

  /**
   * Truncate long text with word boundary awareness
   * @param text Text to truncate
   * @param maxLength Maximum length
   * @returns Truncated text
   */
  truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;

    const truncated = text.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > maxLength * 0.8) {
      return truncated.slice(0, lastSpace) + '...';
    }

    return truncated + '...';
  },
};

/**
 * Abstract interface for tool-specific widgets
 * Each tool type should implement this pattern
 */
export interface IToolWidget {
  /**
   * Get tool-specific icon component
   */
  getIcon(): ReactNode;

  /**
   * Get human-readable description of what this tool does
   */
  getDescription(): string;

  /**
   * Render parameters section (collapsed view shows nothing, expanded shows details)
   */
  renderParameters(): ReactNode;

  /**
   * Render result section (with syntax highlighting if applicable)
   */
  renderResult(): ReactNode;
}
