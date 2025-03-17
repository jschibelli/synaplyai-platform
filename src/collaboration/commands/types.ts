/**
 * Base command interface
 */
export interface Command {
  type: string;
  userId: string;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Base document command with common document fields
 */
export interface DocumentCommand extends Command {
  payload: {
    documentId: string;
    [key: string]: any;
  };
}

/**
 * Command execution result
 */
export interface CommandResult {
  success: boolean;
  data?: any;
  event?: any;
  metadata?: Record<string, any>;
}

/**
 * Validation result for command validation
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Insert text command
 */
export interface InsertTextCommand extends DocumentCommand {
  type: 'INSERT_TEXT';
  payload: {
    documentId: string;
    position: number;
    text: string;
  };
}

/**
 * Delete text command
 */
export interface DeleteTextCommand extends DocumentCommand {
  type: 'DELETE_TEXT';
  payload: {
    documentId: string;
    position: number;
    length: number;
  };
}

/**
 * Format text command
 */
export interface FormatTextCommand extends DocumentCommand {
  type: 'FORMAT_TEXT';
  payload: {
    documentId: string;
    position: number;
    length: number;
    attributes: Record<string, any>;
  };
}

/**
 * Replace text command
 */
export interface ReplaceTextCommand extends DocumentCommand {
  type: 'REPLACE_TEXT';
  payload: {
    documentId: string;
    startPosition: number;
    endPosition: number;
    newText: string;
  };
}