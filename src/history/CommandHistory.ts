import { getTenantContext } from '../lib/tenantContext';
import { CommandRegistry } from '../commands/CommandRegistry';
import { TransactionManager } from '../transactions/TransactionManager';
import { MetricsCollector } from '../metrics/metrics-collector';
import { ComplianceLogger } from '../compliance/logger';

/**
 * Command metadata used for history tracking
 */
export interface CommandHistoryEntry<T = any> {
  /** Command type identifier */
  type: string;
  /** Command data */
  command: T;
  /** Command execution timestamp */
  timestamp: number;
  /** Transaction ID if part of transaction */
  transactionId?: string;
  /** User who executed the command */
  userId: string;
  /** Tenant context */
  tenantId: string;
  /** Whether the command can be undone */
  canUndo: boolean;
  /** Whether the command was already undone */
  undone: boolean;
  /** Unique identifier for this history entry */
  id: string;
}

/**
 * History navigation state
 */
export interface HistoryState {
  /** Current position in history (index pointer) */
  position: number;
  /** Total number of items in history */
  total: number;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Current document version */
  documentVersion: number;
}

/**
 * Command Inverter interface for creating undo commands
 */
export interface CommandInverter {
  /**
   * Invert a command to create its opposite operation
   * @param commandType Type of command to invert
   * @param command Command data
   * @returns Inverted command that will undo the original
   */
  invert<T extends object, R extends object>(commandType: string, command: T): R;
  
  /**
   * Check if a command can be undone
   * @param commandType Type of command
   * @param command Command data
   * @returns True if the command can be undone
   */
  canUndo<T extends object>(commandType: string, command: T): boolean;
}

/**
 * Manages command history and undo/redo operations
 */
export class CommandHistory {
  private history: Map<string, CommandHistoryEntry[]> = new Map();
  private historyPosition: Map<string, number> = new Map();
  private documentVersions: Map<string, number> = new Map();
  
  /**
   * Create a new CommandHistory instance
   * @param commandRegistry Registry for executing commands
   * @param commandInverter Service to invert commands for undo operations
   * @param transactionManager Transaction boundary manager
   * @param metricsCollector Metrics collection service
   * @param options Configuration options
   */
  constructor(
    private commandRegistry: CommandRegistry,
    private commandInverter: CommandInverter,
    private transactionManager: TransactionManager,
    private metricsCollector?: MetricsCollector,
    private options: {
      /** Maximum history size per document */
      maxHistorySize?: number;
      /** Whether to log undo/redo operations */
      logOperations?: boolean;
      /** Whether to track metrics for undo/redo */
      trackMetrics?: boolean;
    } = {}
  ) {
    this.options = {
      maxHistorySize: 100,
      logOperations: true,
      trackMetrics: true,
      ...options
    };
  }
  
  /**
   * Add a command to history
   * @param documentId Document identifier
   * @param commandType Type of command
   * @param command Command data
   * @returns Command history entry
   */
  public addToHistory<T extends object>(
    documentId: string,
    commandType: string,
    command: T
  ): CommandHistoryEntry<T> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot add to history: No tenant context available');
    }
    
    // Get current document history or create a new one
    let documentHistory = this.getDocumentHistory(documentId);
    let position = this.getHistoryPosition(documentId);
    
    // If we're not at the end of history (user has undone some commands),
    // truncate history from this point onwards
    if (position < documentHistory.length - 1) {
      documentHistory = documentHistory.slice(0, position + 1);
      this.setDocumentHistory(documentId, documentHistory);
    }
    
    // Create history entry
    const entry: CommandHistoryEntry<T> = {
      type: commandType,
      command,
      timestamp: Date.now(),
      userId: tenantContext.userId || 'unknown',
      tenantId: tenantContext.tenantId,
      canUndo: this.commandInverter.canUndo(commandType, command),
      undone: false,
      id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      transactionId: this.transactionManager.getCurrentTransactionId() || undefined
    };
    
    // Add to history
    documentHistory.push(entry);
    
    // Enforce maximum history size
    if (documentHistory.length > (this.options.maxHistorySize || 100)) {
      documentHistory.shift();
    }
    
    // Update history and position
    this.setDocumentHistory(documentId, documentHistory);
    this.setHistoryPosition(documentId, documentHistory.length - 1);
    
    // Increment document version
    this.incrementDocumentVersion(documentId);
    
    // Record metrics if enabled
    if (this.options.trackMetrics && this.metricsCollector) {
      this.metricsCollector.incrementCounter('command.history.added', {
        tenantId: tenantContext.tenantId,
        commandType
      });
    }
    
    return entry;
  }
  
  /**
   * Undo the last command for a document
   * @param documentId Document identifier
   * @returns Promise resolving to true if undo was successful, false if there's nothing to undo
   */
  public async undo(documentId: string): Promise<boolean> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot undo: No tenant context available');
    }
    
    const documentHistory = this.getDocumentHistory(documentId);
    let position = this.getHistoryPosition(documentId);
    
    // Check if we have anything to undo
    if (position < 0 || documentHistory.length === 0) {
      return false;
    }
    
    // Get the command to undo
    const entry = documentHistory[position];
    
    // Check if this command can be undone
    if (!entry.canUndo) {
      // Skip to previous undoable command if this one can't be undone
      return this.skipToPreviousUndoable(documentId);
    }
    
    try {
      // Start a transaction for the undo operation
      await this.transactionManager.begin();
      
      // Create inverse command
      const inverseCommand = this.commandInverter.invert(entry.type, entry.command);
      const inverseType = this.getInverseCommandType(entry.type);
      
      // Execute the inverse command
      await this.commandRegistry.execute(inverseType, inverseCommand);
      
      // Mark original command as undone
      documentHistory[position] = {
        ...entry,
        undone: true
      };
      
      // Move history position back
      this.setHistoryPosition(documentId, position - 1);
      this.setDocumentHistory(documentId, documentHistory);
      
      // Increment document version to reflect the change
      this.incrementDocumentVersion(documentId);
      
      // Log undo operation
      if (this.options.logOperations) {
        await ComplianceLogger.log({
          eventType: 'command.undone',
          resourceId: documentId,
          description: `Command ${entry.type} undone`,
          metadata: { commandId: entry.id, commandType: entry.type }
        });
      }
      
      // Record metrics
      if (this.options.trackMetrics && this.metricsCollector) {
        await this.metricsCollector.incrementCounter('command.undone', {
          tenantId: tenantContext.tenantId,
          commandType: entry.type
        });
      }
      
      // Commit the transaction
      await this.transactionManager.commit();
      
      return true;
    } catch (error) {
      // Rollback transaction on failure
      await this.transactionManager.rollback();
      
      console.error(`Error undoing command: ${(error as Error).message}`);
      throw error;
    }
  }
  
  /**
   * Redo a previously undone command
   * @param documentId Document identifier
   * @returns Promise resolving to true if redo was successful, false if there's nothing to redo
   */
  public async redo(documentId: string): Promise<boolean> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot redo: No tenant context available');
    }
    
    const documentHistory = this.getDocumentHistory(documentId);
    let position = this.getHistoryPosition(documentId);
    
    // Check if we have anything to redo
    if (position >= documentHistory.length - 1) {
      return false;
    }
    
    // Get the command to redo
    const entry = documentHistory[position + 1];
    
    // Check if this command was previously undone
    if (!entry.undone) {
      // Skip to next redoable command
      return this.skipToNextRedoable(documentId);
    }
    
    try {
      // Start a transaction for the redo operation
      await this.transactionManager.begin();
      
      // Re-execute the original command
      await this.commandRegistry.execute(entry.type, entry.command);
      
      // Mark command as no longer undone
      documentHistory[position + 1] = {
        ...entry,
        undone: false
      };
      
      // Move history position forward
      this.setHistoryPosition(documentId, position + 1);
      this.setDocumentHistory(documentId, documentHistory);
      
      // Increment document version
      this.incrementDocumentVersion(documentId);
      
      // Log redo operation
      if (this.options.logOperations) {
        await ComplianceLogger.log({
          eventType: 'command.redone',
          resourceId: documentId,
          description: `Command ${entry.type} redone`,
          metadata: { commandId: entry.id, commandType: entry.type }
        });
      }
      
      // Record metrics
      if (this.options.trackMetrics && this.metricsCollector) {
        await this.metricsCollector.incrementCounter('command.redone', {
          tenantId: tenantContext.tenantId,
          commandType: entry.type
        });
      }
      
      // Commit the transaction
      await this.transactionManager.commit();
      
      return true;
    } catch (error) {
      // Rollback transaction on failure
      await this.transactionManager.rollback();
      
      console.error(`Error redoing command: ${(error as Error).message}`);
      throw error;
    }
  }
  
  /**
   * Get current history state for a document
   * @param documentId Document identifier
   * @returns Current history state
   */
  public getHistoryState(documentId: string): HistoryState {
    const documentHistory = this.getDocumentHistory(documentId);
    const position = this.getHistoryPosition(documentId);
    const version = this.getDocumentVersion(documentId);
    
    return {
      position,
      total: documentHistory.length,
      canUndo: position >= 0 && documentHistory.length > 0,
      canRedo: position < documentHistory.length - 1,
      documentVersion: version
    };
  }
  
  /**
   * Get history entries for a document
   * @param documentId Document identifier
   * @returns Array of history entries
   */
  public getHistory(documentId: string): CommandHistoryEntry[] {
    return this.getDocumentHistory(documentId);
  }
  
  /**
   * Clear history for a document
   * @param documentId Document identifier
   */
  public clearHistory(documentId: string): void {
    this.setDocumentHistory(documentId, []);
    this.setHistoryPosition(documentId, -1);
    this.documentVersions.set(documentId, 0);
  }
  
  /**
   * Get the inverse command type for a given command type
   * @param commandType Original command type
   * @returns Inverse command type
   */
  private getInverseCommandType(commandType: string): string {
    // Map of command types to their inverse types
    const inverseMap: Record<string, string> = {
      'INSERT_TEXT': 'DELETE_TEXT',
      'DELETE_TEXT': 'INSERT_TEXT',
      'FORMAT_TEXT': 'UNFORMAT_TEXT',
      'UNFORMAT_TEXT': 'FORMAT_TEXT',
      'MOVE_TEXT': 'MOVE_TEXT',  // Move is its own inverse with different params
    };
    
    return inverseMap[commandType] || `UNDO_${commandType}`;
  }
  
  /**
   * Skip to previous undoable command
   * @param documentId Document identifier
   * @returns True if found an undoable command, false otherwise
   */
  private async skipToPreviousUndoable(documentId: string): Promise<boolean> {
    const documentHistory = this.getDocumentHistory(documentId);
    let position = this.getHistoryPosition(documentId);
    
    // Move back until we find an undoable command
    while (position >= 0) {
      const entry = documentHistory[position];
      
      if (entry && entry.canUndo && !entry.undone) {
        // Found an undoable command, update position
        this.setHistoryPosition(documentId, position);
        return this.undo(documentId);
      }
      
      position--;
    }
    
    // No undoable commands found
    return false;
  }
  
  /**
   * Skip to next redoable command
   * @param documentId Document identifier
   * @returns True if found a redoable command, false otherwise
   */
  private async skipToNextRedoable(documentId: string): Promise<boolean> {
    const documentHistory = this.getDocumentHistory(documentId);
    let position = this.getHistoryPosition(documentId);
    
    // Move forward until we find a redoable command
    while (position < documentHistory.length - 1) {
      const entry = documentHistory[position + 1];
      
      if (entry && entry.undone) {
        // Found a redoable command, update position
        this.setHistoryPosition(documentId, position);
        return this.redo(documentId);
      }
      
      position++;
    }
    
    // No redoable commands found
    return false;
  }
  
  /**
   * Get document history ensuring tenant isolation
   * @param documentId Document identifier
   * @returns Array of history entries
   */
  private getDocumentHistory(documentId: string): CommandHistoryEntry[] {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot access history: No tenant context available');
    }
    
    const key = `${tenantContext.tenantId}:${documentId}`;
    return this.history.get(key) || [];
  }
  
  /**
   * Set document history with tenant isolation
   * @param documentId Document identifier
   * @param history New document history
   */
  private setDocumentHistory(documentId: string, history: CommandHistoryEntry[]): void {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot update history: No tenant context available');
    }
    
    const key = `${tenantContext.tenantId}:${documentId}`;
    this.history.set(key, history);
  }
  
  /**
   * Get history position for a document with tenant isolation
   * @param documentId Document identifier
   * @returns Current history position
   */
  private getHistoryPosition(documentId: string): number {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot access history position: No tenant context available');
    }
    
    const key = `${tenantContext.tenantId}:${documentId}`;
    return this.historyPosition.get(key) ?? -1;
  }
  
  /**
   * Set history position for a document with tenant isolation
   * @param documentId Document identifier
   * @param position New history position
   */
  private setHistoryPosition(documentId: string, position: number): void {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot update history position: No tenant context available');
    }
    
    const key = `${tenantContext.tenantId}:${documentId}`;
    this.historyPosition.set(key, position);
  }
  
  /**
   * Get document version with tenant isolation
   * @param documentId Document identifier
   * @returns Current document version
   */
  private getDocumentVersion(documentId: string): number {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot access document version: No tenant context available');
    }
    
    const key = `${tenantContext.tenantId}:${documentId}`;
    return this.documentVersions.get(key) ?? 0;
  }
  
  /**
   * Increment document version
   * @param documentId Document identifier
   * @returns New document version
   */
  private incrementDocumentVersion(documentId: string): number {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot update document version: No tenant context available');
    }
    
    const key = `${tenantContext.tenantId}:${documentId}`;
    const currentVersion = this.documentVersions.get(key) ?? 0;
    const newVersion = currentVersion + 1;
    this.documentVersions.set(key, newVersion);
    return newVersion;
  }
}