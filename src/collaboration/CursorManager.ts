import { getCurrentTenantContext as getTenantContext } from '../lib/tenant-context';
import { MetricsCollector } from '../metrics/collector';

/**
 * Range in a document
 */
export interface Range {
  /**
   * Start position (inclusive)
   */
  start: number;
  
  /**
   * End position (exclusive)
   */
  end: number;
}

/**
 * User cursor position
 */
export interface CursorPosition {
  /**
   * User ID
   */
  userId: string;
  
  /**
   * Display name for the user
   */
  displayName: string;
  
  /**
   * User's color for cursor display
   */
  color: string;
  
  /**
   * Current cursor/caret position
   */
  position: number;
  
  /**
   * Selected text range, if any
   */
  selection?: Range;
  
  /**
   * Timestamp when the position was last updated
   */
  updatedAt: number;
}

/**
 * Options for cursor manager
 */
export interface CursorManagerOptions {
  /**
   * How long cursors should be retained after a user disconnects (ms)
   */
  cursorRetentionMs: number;
  
  /**
   * How frequently to clean up stale cursors (ms)
   */
  cleanupIntervalMs: number;
  
  /**
   * Whether to track metrics for cursor operations
   */
  trackMetrics?: boolean;
  
  /**
   * Whether to auto-assign colors for users
   */
  autoAssignColors?: boolean;
  
  /**
   * Color palette for auto-assigned colors
   */
  colorPalette?: string[];
}

/**
 * Manages collaborative cursor positions
 */
export class CursorManager {
  private cursorsByDocument: Map<string, Map<string, CursorPosition>> = new Map();
  private cleanupTimer?: NodeJS.Timeout;
  private options: CursorManagerOptions;
  
  private readonly DEFAULT_COLOR_PALETTE = [
    '#f44336', // red
    '#2196f3', // blue
    '#4caf50', // green
    '#ff9800', // orange
    '#9c27b0', // purple
    '#00bcd4', // cyan
    '#ffeb3b', // yellow
    '#795548', // brown
    '#607d8b', // blue-grey
    '#009688'  // teal
  ];
  
  /**
   * Create a new cursor manager
   */
  constructor(
    private metricsCollector?: MetricsCollector,
    options?: Partial<CursorManagerOptions>
  ) {
    this.options = {
      cursorRetentionMs: 300000, // 5 minutes
      cleanupIntervalMs: 60000, // 1 minute
      trackMetrics: true,
      autoAssignColors: true,
      colorPalette: this.DEFAULT_COLOR_PALETTE,
      ...options
    };
    
    this.startCleanupTimer();
  }
  
  /**
   * Update a user's cursor position
   */
  public updateCursorPosition(
    documentId: string,
    userId: string,
    position: number,
    selection?: Range,
    displayName?: string,
    color?: string
  ): CursorPosition {
    const tenantContext = getTenantContext();  // Make sure this function name matches
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot update cursor: No tenant context available');
    }
    
    const tenantDocumentKey = `${tenantContext.tenantId}:${documentId}`;
    
    // Get or create document cursor map
    let documentCursors = this.cursorsByDocument.get(tenantDocumentKey);
    if (!documentCursors) {
      documentCursors = new Map<string, CursorPosition>();
      this.cursorsByDocument.set(tenantDocumentKey, documentCursors);
    }
    
    // Get existing cursor data or create new
    const existingCursor = documentCursors.get(userId);
    const assignedColor = color || existingCursor?.color || this.getAutoAssignedColor(tenantDocumentKey, userId);
    
    // Create updated cursor data
    const updatedCursor: CursorPosition = {
      userId,
      displayName: displayName || existingCursor?.displayName || 'Unknown User',
      color: assignedColor,
      position,
      selection,
      updatedAt: Date.now()
    };
    
    // Store updated cursor
    documentCursors.set(userId, updatedCursor);
    
    // Track metrics if enabled
    if (this.options.trackMetrics && this.metricsCollector) {
      this.metricsCollector.track?.('cursor.update', 1, {
        tenantId: tenantContext.tenantId,
        documentId
      });
    }
    
    return updatedCursor;
  }
  
  /**
   * Get all cursor positions for a document
   */
  public getDocumentCursors(documentId: string): CursorPosition[] {
    const tenantContext = getTenantContext(); // Make sure this function name matches
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot get cursors: No tenant context available');
    }
    
    const tenantDocumentKey = `${tenantContext.tenantId}:${documentId}`;
    const documentCursors = this.cursorsByDocument.get(tenantDocumentKey);
    
    if (!documentCursors) {
      return [];
    }
    
    return Array.from(documentCursors.values());
  }
  
  /**
   * Get cursor for a specific user
   */
  public getUserCursor(documentId: string, userId: string): CursorPosition | undefined {
    const tenantContext = getTenantContext(); // Make sure this function name matches
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot get cursor: No tenant context available');
    }
    
    const tenantDocumentKey = `${tenantContext.tenantId}:${documentId}`;
    return this.cursorsByDocument.get(tenantDocumentKey)?.get(userId);
  }
  
  /**
   * Remove a user's cursor from a document
   */
  public removeCursor(documentId: string, userId: string): void {
    const tenantContext = getTenantContext(); // Make sure this function name matches
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot remove cursor: No tenant context available');
    }
    
    const tenantDocumentKey = `${tenantContext.tenantId}:${documentId}`;
    const documentCursors = this.cursorsByDocument.get(tenantDocumentKey);
    
    if (!documentCursors) {
      return;
    }
    
    // Remove cursor
    documentCursors.delete(userId);
    
    // If no cursors left, clean up document entry
    if (documentCursors.size === 0) {
      this.cursorsByDocument.delete(tenantDocumentKey);
    }
    
    // Track metrics if enabled
    if (this.options.trackMetrics && this.metricsCollector) {
      this.metricsCollector.track?.('cursor.remove', 1, {
        tenantId: tenantContext.tenantId,
        documentId
      });
    }
  }
  
  // Rest of the class implementation remains the same
  
  /**
   * Update cursor positions after text insertion
   */
  public adjustCursorsForInsertion(
    documentId: string,
    insertPosition: number,
    insertLength: number,
    excludeUserId?: string
  ): void {
    const tenantContext = getTenantContext(); // Make sure this function name matches
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot adjust cursors: No tenant context available');
    }
    
    const tenantDocumentKey = `${tenantContext.tenantId}:${documentId}`;
    const documentCursors = this.cursorsByDocument.get(tenantDocumentKey);
    
    if (!documentCursors) {
      return;
    }
    
    // Adjust each cursor
    documentCursors.forEach((cursor, userId) => {
      // Skip the user who made the insertion
      if (excludeUserId && userId === excludeUserId) {
        return;
      }
      
      let newPosition = cursor.position;
      let newSelection = cursor.selection;
      
      // Adjust cursor position
      if (cursor.position >= insertPosition) {
        newPosition = cursor.position + insertLength;
      }
      
      // Adjust selection if it exists
      if (cursor.selection) {
        // Selection start is after or at insertion point
        if (cursor.selection.start >= insertPosition) {
          newSelection = {
            start: cursor.selection.start + insertLength,
            end: cursor.selection.end + insertLength
          };
        }
        // Selection end is after insertion point but start is before
        else if (cursor.selection.end > insertPosition) {
          newSelection = {
            start: cursor.selection.start,
            end: cursor.selection.end + insertLength
          };
        }
      }
      
      // Update cursor with adjusted position
      if (newPosition !== cursor.position || newSelection !== cursor.selection) {
        documentCursors.set(userId, {
          ...cursor,
          position: newPosition,
          selection: newSelection
        });
      }
    });
  }
  
  /**
   * Update cursor positions after text deletion
   */
  public adjustCursorsForDeletion(
    documentId: string,
    deletePosition: number,
    deleteLength: number,
    excludeUserId?: string
  ): void {
    const tenantContext = getTenantContext(); // Make sure this function name matches
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot adjust cursors: No tenant context available');
    }
    
    const tenantDocumentKey = `${tenantContext.tenantId}:${documentId}`;
    const documentCursors = this.cursorsByDocument.get(tenantDocumentKey);
    
    if (!documentCursors) {
      return;
    }
    
    const deleteEnd = deletePosition + deleteLength;
    
    // Adjust each cursor
    documentCursors.forEach((cursor, userId) => {
      // Skip the user who made the deletion
      if (excludeUserId && userId === excludeUserId) {
        return;
      }
      
      let newPosition = cursor.position;
      let newSelection = cursor.selection;
      
      // Adjust cursor position
      if (cursor.position >= deleteEnd) {
        // Cursor is after the deleted text
        newPosition = cursor.position - deleteLength;
      } else if (cursor.position > deletePosition) {
        // Cursor is within the deleted text - move to deletion start
        newPosition = deletePosition;
      }
      
      // Adjust selection if it exists
      if (cursor.selection) {
        if (cursor.selection.start >= deleteEnd) {
          // Selection starts after deleted text
          newSelection = {
            start: cursor.selection.start - deleteLength,
            end: cursor.selection.end - deleteLength
          };
        } else if (cursor.selection.end <= deletePosition) {
          // Selection ends before deleted text - no change
          newSelection = cursor.selection;
        } else if (cursor.selection.start < deletePosition && cursor.selection.end > deleteEnd) {
          // Selection surrounds deleted text
          newSelection = {
            start: cursor.selection.start,
            end: cursor.selection.end - deleteLength
          };
        } else if (cursor.selection.start < deletePosition && cursor.selection.end <= deleteEnd) {
          // Selection starts before and ends within deleted text
          newSelection = {
            start: cursor.selection.start,
            end: deletePosition
          };
        } else if (cursor.selection.start >= deletePosition && cursor.selection.end > deleteEnd) {
          // Selection starts within and ends after deleted text
          newSelection = {
            start: deletePosition,
            end: cursor.selection.end - deleteLength
          };
        } else if (cursor.selection.start >= deletePosition && cursor.selection.end <= deleteEnd) {
          // Selection completely within deleted text - collapse at deletion point
          newSelection = {
            start: deletePosition,
            end: deletePosition
          };
        }
      }
      
      // Update cursor with adjusted position
      if (newPosition !== cursor.position || newSelection !== cursor.selection) {
        documentCursors.set(userId, {
          ...cursor,
          position: newPosition,
          selection: newSelection
        });
      }
    });
  }
  
  /**
   * Get auto-assigned color for a user
   */
  private getAutoAssignedColor(documentKey: string, userId: string): string {
    if (!this.options.autoAssignColors || !this.options.colorPalette?.length) {
      return '#000000'; // Default black
    }
    
    // Get existing colors in use for this document
    const documentCursors = this.cursorsByDocument.get(documentKey);
    const usedColors = new Set<string>();
    
    if (documentCursors) {
      documentCursors.forEach(cursor => {
        if (cursor.userId !== userId) {
          usedColors.add(cursor.color);
        }
      });
    }
    
    // Find first unused color
    for (const color of this.options.colorPalette) {
      if (!usedColors.has(color)) {
        return color;
      }
    }
    
    // If all colors are used, pick one based on user ID hash
    const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return this.options.colorPalette[hash % this.options.colorPalette.length];
  }
  
  /**
   * Start periodic cleanup of stale cursor data
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleCursors();
    }, this.options.cleanupIntervalMs);
  }
  
  /**
   * Clean up stale cursor data
   */
  private cleanupStaleCursors(): void {
    const now = Date.now();
    const staleThreshold = now - this.options.cursorRetentionMs;
    
    // Check each document
    this.cursorsByDocument.forEach((documentCursors, tenantDocumentKey) => {
      let hasRemovals = false;
      
      // Check each cursor
      documentCursors.forEach((cursor, userId) => {
        // Remove if last update time is older than retention threshold
        if (cursor.updatedAt < staleThreshold) {
          documentCursors.delete(userId);
          hasRemovals = true;
        }
      });
      
      // Remove document entry if all cursors removed
      if (hasRemovals && documentCursors.size === 0) {
        this.cursorsByDocument.delete(tenantDocumentKey);
      }
    });
  }
  
  /**
   * Stop all timers and clean up resources
   */
  public dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cursorsByDocument.clear();
  }
}