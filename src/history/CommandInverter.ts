import { CommandInverter } from './CommandHistory';
import { EventStore } from '../events/EventStore';

/**
 * Default implementation of CommandInverter that creates inverse commands
 * for undo/redo operations
 */
export class DefaultCommandInverter implements CommandInverter {
  /**
   * Create a new CommandInverter
   * @param eventStore Optional event store for retrieving event data needed for inversion
   */
  constructor(private eventStore?: EventStore) {}

  /**
   * Check if a command can be undone
   * @param commandType Type of command
   * @param command Command data
   * @returns True if the command can be undone
   */
  canUndo<T extends object>(commandType: string, command: T): boolean {
    // Most standard editing commands can be undone
    switch (commandType) {
      case 'INSERT_TEXT':
      case 'DELETE_TEXT':
      case 'FORMAT_TEXT':
      case 'UNFORMAT_TEXT':
      case 'REPLACE_TEXT':
      case 'MOVE_TEXT':
        return true;

      // Add additional commands that can be undone here
        
      default:
        // For custom commands, check if they have an inverse mapping
        return this.hasInverseMapping(commandType);
    }
  }

  /**
   * Invert a command to create its opposite operation
   * @param commandType Type of command to invert
   * @param command Command data
   * @returns Inverted command that will undo the original
   */
  invert<T extends object, R extends object>(commandType: string, command: T): R {
    switch (commandType) {
      case 'INSERT_TEXT':
        return this.invertInsertText(command as any) as unknown as R;
      case 'DELETE_TEXT':
        return this.invertDeleteText(command as any) as unknown as R;
      case 'FORMAT_TEXT':
        return this.invertFormatText(command as any) as unknown as R;
      case 'UNFORMAT_TEXT':
        return this.invertUnformatText(command as any) as unknown as R;
      case 'REPLACE_TEXT':
        return this.invertReplaceText(command as any) as unknown as R;
      case 'MOVE_TEXT':
        return this.invertMoveText(command as any) as unknown as R;
      default:
        // Try to invert using custom mappings
        if (this.hasInverseMapping(commandType)) {
          return this.invertWithCustomMapping(commandType, command) as unknown as R;
        }
        throw new Error(`Command type '${commandType}' cannot be inverted`);
    }
  }

  /**
   * Invert an INSERT_TEXT command by creating a DELETE_TEXT command
   */
  private invertInsertText(command: { 
    documentId: string; 
    position: number; 
    text: string; 
  }): { 
    documentId: string; 
    position: number; 
    length: number;
  } {
    return {
      documentId: command.documentId,
      position: command.position,
      length: command.text.length
    };
  }

  /**
   * Invert a DELETE_TEXT command by creating an INSERT_TEXT command
   */
  private invertDeleteText(command: { 
    documentId: string; 
    position: number; 
    length: number;
    oldText?: string; // The text that was deleted
  }): { 
    documentId: string; 
    position: number; 
    text: string;
  } {
    // If the command includes the deleted text, use it
    if (command.oldText !== undefined) {
      return {
        documentId: command.documentId,
        position: command.position,
        text: command.oldText
      };
    }
    
    // Otherwise, we need event data to know what text was deleted
    // This would typically be retrieved from the event store
    // In a real implementation, this might be an async operation
    throw new Error('Cannot invert DELETE_TEXT command without oldText property');
  }

  /**
   * Invert a FORMAT_TEXT command by creating an UNFORMAT_TEXT command
   */
  private invertFormatText(command: { 
    documentId: string; 
    position: number; 
    length: number;
    formatting: Record<string, any>;
    previousFormatting?: Record<string, any>; 
  }): { 
    documentId: string; 
    position: number; 
    length: number;
    formatting: Record<string, any>;
  } {
    return {
      documentId: command.documentId,
      position: command.position,
      length: command.length,
      // If we know the previous formatting, restore it; otherwise, remove current formatting
      formatting: command.previousFormatting || command.formatting
    };
  }

  /**
   * Invert an UNFORMAT_TEXT command by creating a FORMAT_TEXT command
   */
  private invertUnformatText(command: { 
    documentId: string; 
    position: number; 
    length: number;
    formatting: Record<string, any>;
  }): { 
    documentId: string; 
    position: number; 
    length: number;
    formatting: Record<string, any>;
  } {
    return {
      documentId: command.documentId,
      position: command.position,
      length: command.length,
      formatting: command.formatting
    };
  }

  /**
   * Invert a REPLACE_TEXT command
   */
  private invertReplaceText(command: { 
    documentId: string; 
    startPosition: number; 
    endPosition: number;
    newText: string;
    oldText: string;
  }): { 
    documentId: string; 
    startPosition: number; 
    endPosition: number;
    newText: string;
  } {
    return {
      documentId: command.documentId,
      startPosition: command.startPosition,
      endPosition: command.startPosition + command.newText.length,
      newText: command.oldText
    };
  }

  /**
   * Invert a MOVE_TEXT command by creating another MOVE_TEXT command
   * that moves the text back to its original position
   */
  private invertMoveText(command: { 
    documentId: string; 
    sourcePosition: number; 
    targetPosition: number;
    length: number;
  }): { 
    documentId: string; 
    sourcePosition: number; 
    targetPosition: number;
    length: number;
  } {
    // Calculate adjusted positions to move the text back
    // This needs to account for the fact that the text has already been moved
    let adjustedSourcePosition: number;
    let adjustedTargetPosition: number;
    
    if (command.sourcePosition < command.targetPosition) {
      // Text was moved forward
      adjustedSourcePosition = command.targetPosition - command.length;
      adjustedTargetPosition = command.sourcePosition;
    } else {
      // Text was moved backward
      adjustedSourcePosition = command.targetPosition;
      adjustedTargetPosition = command.sourcePosition + command.length;
    }
    
    return {
      documentId: command.documentId,
      sourcePosition: adjustedSourcePosition,
      targetPosition: adjustedTargetPosition,
      length: command.length
    };
  }

  /**
   * Check if a custom command has an inverse mapping
   */
  private hasInverseMapping(commandType: string): boolean {
    // This could be extended to check a registry of custom command inversions
    return false;
  }

  /**
   * Invert a command using a custom mapping
   */
  private invertWithCustomMapping(commandType: string, command: any): any {
    // This would be implemented to handle custom command types
    throw new Error(`No custom inversion mapping for command type '${commandType}'`);
  }
}