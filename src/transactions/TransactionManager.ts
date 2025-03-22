import { getTenantContext } from '../lib/tenant-context';
import { ComplianceLogger } from '../compliance/logger';
import { MetricsCollector } from '../metrics/metrics-collector';

/**
 * Hybrid Logical Clock implementation for consistent ordering 
 * across distributed systems
 */
export class HybridLogicalClock {
  private wallTime: number; // Physical time component
  private logical: number;  // Logical counter component
  private nodeId: string;   // Unique identifier for this node
  
  /**
   * Create a new hybrid logical clock
   * @param nodeId Unique identifier for this node
   * @param initialTime Initial wall time (defaults to current time)
   */
  constructor(nodeId: string, initialTime?: number) {
    this.wallTime = initialTime || Date.now();
    this.logical = 0;
    this.nodeId = nodeId;
  }
  
  /**
   * Advance the clock for a local event
   * @returns Clock timestamp
   */
  tick(): string {
    const now = Date.now();
    
    if (now > this.wallTime) {
      // Physical time has advanced
      this.wallTime = now;
      this.logical = 0;
    } else {
      // Physical time has not advanced, increment logical counter
      this.logical += 1;
    }
    
    return this.getTimestamp();
  }
  
  /**
   * Update clock based on a remote timestamp
   * @param remoteTimestamp Timestamp from another node
   * @returns Updated local timestamp
   */
  update(remoteTimestamp: string): string {
    const [remoteWall, remoteLogical] = this.parseTimestamp(remoteTimestamp);
    const now = Date.now();
    
    // Update wallTime to be the maximum of local wall time, remote wall time, and current time
    this.wallTime = Math.max(this.wallTime, remoteWall, now);
    
    // Update logical component
    if (remoteWall === this.wallTime) {
      this.logical = Math.max(this.logical + 1, remoteLogical + 1);
    } else if (now === this.wallTime) {
      this.logical = Math.max(this.logical + 1, 0);
    } else {
      this.logical = 0;
    }
    
    return this.getTimestamp();
  }
  
  /**
   * Get current timestamp as a string
   */
  getTimestamp(): string {
    return `${this.wallTime}-${this.logical}-${this.nodeId}`;
  }
  
  /**
   * Parse a timestamp string into its components
   * @param timestamp Timestamp string to parse
   * @returns Tuple of [wallTime, logical, nodeId]
   */
  parseTimestamp(timestamp: string): [number, number, string] {
    const parts = timestamp.split('-');
    return [
      parseInt(parts[0], 10), 
      parseInt(parts[1], 10),
      parts[2]
    ];
  }
  
  /**
   * Compare two timestamps
   * @param a First timestamp
   * @param b Second timestamp
   * @returns -1 if a < b, 0 if a = b, 1 if a > b
   */
  compare(a: string, b: string): number {
    const [wallA, logicalA] = this.parseTimestamp(a);
    const [wallB, logicalB] = this.parseTimestamp(b);
    
    if (wallA < wallB) return -1;
    if (wallA > wallB) return 1;
    
    if (logicalA < logicalB) return -1;
    if (logicalA > logicalB) return 1;
    
    return 0;
  }
}

/**
 * Transaction metadata
 */
export interface Transaction {
  /** Unique transaction identifier */
  id: string;
  /** Tenant ID this transaction belongs to */
  tenantId: string;
  /** User who initiated the transaction */
  userId: string;
  /** Hybrid logical clock timestamp when transaction started */
  startTimestamp: string;
  /** Context/purpose of this transaction */
  context: string;
  /** When the transaction was committed (undefined if still active) */
  commitTimestamp?: string;
  /** Whether the transaction was aborted */
  aborted?: boolean;
}

/**
 * Transaction boundary manager using hybrid logical clocks
 * for consistent ordering across distributed systems
 */
export class TransactionManager {
  private activeTransactions = new Map<string, Transaction>();
  private clock: HybridLogicalClock;
  private metricsCollector: MetricsCollector;
  
  /**
   * Create a transaction manager
   * @param nodeId Unique identifier for this node
   * @param metricsCollector Metrics collector for monitoring
   */
  constructor(nodeId: string, metricsCollector: MetricsCollector) {
    this.clock = new HybridLogicalClock(nodeId);
    this.metricsCollector = metricsCollector;
  }
  
  /**
   * Begin a new transaction
   * @param context Description of the transaction's purpose
   * @returns Transaction object
   */
  async beginTransaction(context: string): Promise<Transaction> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot begin transaction: No tenant context available');
    }
    
    const timestamp = this.clock.tick();
    const transactionId = `tx-${timestamp}-${Math.random().toString(36).substring(2, 9)}`;
    
    const transaction: Transaction = {
      id: transactionId,
      tenantId: tenantContext.tenantId,
      userId: tenantContext.userId || 'system',
      startTimestamp: timestamp,
      context
    };
    
    this.activeTransactions.set(transactionId, transaction);
    
    // Record transaction start in metrics
    await this.metricsCollector.incrementCounter('transaction.started', {
      tenantId: tenantContext.tenantId,
      context
    });
    
    // Log to compliance
    await ComplianceLogger.log({
      eventType: 'transaction.started',
      resourceId: transactionId,
      description: `Transaction started: ${context}`,
      metadata: {
        timestamp,
        tenantId: tenantContext.tenantId,
        userId: tenantContext.userId
      }
    });
    
    return transaction;
  }
  
  /**
   * Commit a transaction
   * @param transactionId ID of the transaction to commit
   * @returns The committed transaction
   * @throws Error if transaction not found or already committed/aborted
   */
  async commitTransaction(transactionId: string): Promise<Transaction> {
    const transaction = this.activeTransactions.get(transactionId);
    
    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }
    
    if (transaction.commitTimestamp) {
      throw new Error(`Transaction ${transactionId} already committed`);
    }
    
    if (transaction.aborted) {
      throw new Error(`Cannot commit aborted transaction: ${transactionId}`);
    }
    
    const timestamp = this.clock.tick();
    transaction.commitTimestamp = timestamp;
    
    // Remove from active transactions
    this.activeTransactions.delete(transactionId);
    
    // Record transaction commit in metrics
    await this.metricsCollector.incrementCounter('transaction.committed', {
      tenantId: transaction.tenantId,
      context: transaction.context
    });
    
    // Log to compliance
    await ComplianceLogger.log({
      eventType: 'transaction.committed',
      resourceId: transactionId,
      description: `Transaction committed: ${transaction.context}`,
      metadata: {
        startTimestamp: transaction.startTimestamp,
        commitTimestamp: timestamp,
        tenantId: transaction.tenantId,
        userId: transaction.userId,
        duration: this.calculateDurationMs(transaction.startTimestamp, timestamp)
      }
    });
    
    return transaction;
  }
  
  /**
   * Abort a transaction
   * @param transactionId ID of the transaction to abort
   * @param reason Reason for aborting the transaction
   * @returns The aborted transaction
   * @throws Error if transaction not found or already committed/aborted
   */
  async abortTransaction(transactionId: string, reason: string): Promise<Transaction> {
    const transaction = this.activeTransactions.get(transactionId);
    
    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }
    
    if (transaction.commitTimestamp) {
      throw new Error(`Cannot abort already committed transaction: ${transactionId}`);
    }
    
    if (transaction.aborted) {
      throw new Error(`Transaction ${transactionId} already aborted`);
    }
    
    const timestamp = this.clock.tick();
    transaction.aborted = true;
    
    // Remove from active transactions
    this.activeTransactions.delete(transactionId);
    
    // Record transaction abort in metrics
    await this.metricsCollector.incrementCounter('transaction.aborted', {
      tenantId: transaction.tenantId,
      context: transaction.context,
      reason
    });
    
    // Log to compliance
    await ComplianceLogger.log({
      eventType: 'transaction.aborted',
      resourceId: transactionId,
      description: `Transaction aborted: ${transaction.context}`,
      metadata: {
        reason,
        startTimestamp: transaction.startTimestamp,
        abortTimestamp: timestamp,
        tenantId: transaction.tenantId,
        userId: transaction.userId,
        duration: this.calculateDurationMs(transaction.startTimestamp, timestamp)
      }
    });
    
    return transaction;
  }
  
  /**
   * Check if an operation is allowed based on transaction boundaries
   * @param operationId Unique identifier for the operation
   * @param documentId Document being modified
   * @param transactionId Current transaction ID 
   * @param previousTransactionId ID of transaction that last modified this document
   * @returns Boolean indicating if operation is allowed
   */
  async isOperationAllowed(
    operationId: string, 
    documentId: string, 
    transactionId: string, 
    previousTransactionId?: string
  ): Promise<boolean> {
    const transaction = this.activeTransactions.get(transactionId);
    
    if (!transaction) {
      await this.logViolation('transaction.invalid', 
        `Operation attempted with invalid transaction ID: ${transactionId}`,
        { operationId, documentId, transactionId }
      );
      return false;
    }
    
    // Verify tenant context
    const tenantContext = getTenantContext();
    if (!tenantContext || tenantContext.tenantId !== transaction.tenantId) {
      await this.logViolation('transaction.tenant_mismatch',
        `Transaction tenant (${transaction.tenantId}) doesn't match current tenant (${tenantContext?.tenantId})`,
        { operationId, documentId, transactionId, currentTenant: tenantContext?.tenantId }
      );
      return false;
    }
    
    // Check for recursive updates based on transaction ID (prevent circular updates)
    if (previousTransactionId === transactionId) {
      await this.logViolation('transaction.recursive_update',
        `Blocked recursive update in transaction: ${transactionId}`,
        { operationId, documentId, transactionId }
      );
      return false;
    }
    
    // If there's a previous transaction, verify temporal ordering using HLC
    if (previousTransactionId) {
      const prevTx = await this.getTransactionHistory(previousTransactionId);
      
      if (prevTx && transaction.startTimestamp && prevTx.commitTimestamp &&
          this.clock.compare(transaction.startTimestamp, prevTx.commitTimestamp) < 0) {
        await this.logViolation('transaction.causality_violation',
          `Causality violation: transaction ${transactionId} started before dependency ${previousTransactionId} committed`,
          { operationId, documentId, transactionId, previousTransactionId }
        );
        return false;
      }
    }
    
    // All checks passed
    return true;
  }
  
  /**
   * Get active transaction by ID
   * @param transactionId Transaction ID
   * @returns Transaction or undefined if not found
   */
  getTransaction(transactionId: string): Transaction | undefined {
    return this.activeTransactions.get(transactionId);
  }
  
  /**
   * Get all active transactions for the current tenant
   * @returns Array of active transactions
   */
  getActiveTenantTransactions(): Transaction[] {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      return [];
    }
    
    return Array.from(this.activeTransactions.values())
      .filter(tx => tx.tenantId === tenantContext.tenantId);
  }
  
  /**
   * Update clock based on external timestamp
   * @param externalTimestamp External timestamp to incorporate
   * @returns Updated local timestamp
   */
  updateClock(externalTimestamp: string): string {
    return this.clock.update(externalTimestamp);
  }
  
  /**
   * Get current clock timestamp
   * @returns Current timestamp
   */
  getCurrentTimestamp(): string {
    return this.clock.getTimestamp();
  }
  
  /**
   * Calculate duration between two HLC timestamps in milliseconds
   * @param startTimestamp Start timestamp 
   * @param endTimestamp End timestamp
   * @returns Duration in milliseconds
   */
  private calculateDurationMs(startTimestamp: string, endTimestamp: string): number {
    const [startWall] = this.clock.parseTimestamp(startTimestamp);
    const [endWall] = this.clock.parseTimestamp(endTimestamp);
    
    return endWall - startWall;
  }
  
  /**
   * Log a transaction violation to metrics and compliance log
   * @param violationType Type of violation
   * @param description Description of the violation
   * @param metadata Additional metadata about the violation
   */
  private async logViolation(
    violationType: string,
    description: string,
    metadata: Record<string, any>
  ): Promise<void> {
    // Record violation in metrics
    await this.metricsCollector.incrementCounter(`transaction.violation.${violationType}`, {
      tenantId: getTenantContext()?.tenantId || 'unknown'
    });
    
    // Log to compliance
    await ComplianceLogger.log({
      eventType: `transaction.violation.${violationType}`,
      resourceId: metadata.transactionId || 'unknown',
      description,
      metadata: {
        ...metadata,
        timestamp: this.getCurrentTimestamp(),
        tenantId: getTenantContext()?.tenantId || 'unknown',
        userId: getTenantContext()?.userId || 'unknown'
      }
    });
  }
  
  /**
   * Retrieve transaction history from persistent storage
   * This is a stub - in a real implementation, this would fetch from a database
   * @param transactionId Transaction ID to retrieve
   * @returns Transaction history or null if not found
   */
  private async getTransactionHistory(transactionId: string): Promise<Transaction | null> {
    // In a real implementation, this would query a database for transaction history
    // For now, we'll return null to indicate "not found"
    return null;
  }
}
