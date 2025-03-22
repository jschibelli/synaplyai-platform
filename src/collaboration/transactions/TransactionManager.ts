import { PrismaClient, Prisma } from '@prisma/client';
import { getTenantContext } from '../../lib/tenant-context';
import { MetricsCollector } from '../../metrics/metrics-collector';

export interface HybridLogicalClock {
  wallTime: number;  // Physical component (milliseconds)
  logical: number;   // Logical component (counter)
  nodeId: string;    // Node identifier
}

export interface Transaction {
  client: Prisma.TransactionClient;
  id: string;
  tenantId: string;
  timestamp: HybridLogicalClock;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export class TransactionManager {
  private prisma: PrismaClient;
  private metricsCollector: MetricsCollector;
  private clock: HybridLogicalClock;
  private activeTransactions = new Map<string, Transaction>();
  
  constructor(prisma: PrismaClient, metricsCollector: MetricsCollector) {
    this.prisma = prisma;
    this.metricsCollector = metricsCollector;
    this.clock = {
      wallTime: Date.now(),
      logical: 0,
      nodeId: process.env.NODE_ID || 'node-' + Math.random().toString(36).substr(2, 9)
    };
  }
  
  /**
   * Start a transaction with tenant isolation and vector clock tracking
   * @returns Transaction object
   */
  async startTransaction(): Promise<Transaction> {
    const tenantContext = getTenantContext();
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot start transaction: No tenant context available');
    }
    
    // Tick the clock to get a new timestamp
    this.tickClock();
    const timestamp = { ...this.clock };
    
    const startTime = performance.now();
    
    try {
      // Start a transaction
      const client = await this.prisma.$transaction(Prisma.TransactionIsolationLevel.ReadCommitted);
      
      // Generate a unique transaction ID
      const id = `tx-${timestamp.nodeId}-${timestamp.wallTime}-${timestamp.logical}`;
      
      const transaction: Transaction = {
        id,
        client,
        tenantId: tenantContext.tenantId,
        timestamp,
        
        // Commit the transaction
        commit: async () => {
          if (!this.activeTransactions.has(id)) {
            throw new Error(`Transaction ${id} not found or already completed`);
          }
          
          const commitStartTime = performance.now();
          await client.$commit();
          this.activeTransactions.delete(id);
          
          await this.metricsCollector.recordLatency(
            'transaction.commit', 
            performance.now() - commitStartTime
          );
        },
        
        // Rollback the transaction
        rollback: async () => {
          if (!this.activeTransactions.has(id)) {
            return; // Already rolled back or not found
          }
          
          const rollbackStartTime = performance.now();
          await client.$rollback();
          this.activeTransactions.delete(id);
          
          await this.metricsCollector.recordLatency(
            'transaction.rollback', 
            performance.now() - rollbackStartTime
          );
          
          await this.metricsCollector.increment('transaction.rollback.count', 1);
        }
      };
      
      // Store the active transaction
      this.activeTransactions.set(id, transaction);
      
      // Record transaction creation metrics
      await this.metricsCollector.recordLatency(
        'transaction.create', 
        performance.now() - startTime
      );
      await this.metricsCollector.increment('transaction.active', 1);
      
      return transaction;
    } catch (error) {
      // Record transaction creation failure
      await this.metricsCollector.increment('transaction.create.error', 1);
      throw error;
    }
  }
  
  /**
   * Execute a function within a transaction
   * @param fn Function to execute within transaction
   * @returns Result of the function execution
   */
  async executeInTransaction<T>(fn: (transaction: Transaction) => Promise<T>): Promise<T> {
    const transaction = await this.startTransaction();
    
    try {
      const result = await fn(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
  
  /**
   * Get the current hybrid logical clock timestamp
   * @returns Current HLC timestamp
   */
  getCurrentTimestamp(): HybridLogicalClock {
    return { ...this.clock };
  }
  
  /**
   * Update the logical clock based on observed timestamp
   * @param observed Observed timestamp from another node
   */
  observeClock(observed: HybridLogicalClock): void {
    // Hybrid Logical Clock update algorithm
    const now = Date.now();
    
    // Take the max of local physical time, observed physical time, and current time
    this.clock.wallTime = Math.max(this.clock.wallTime, observed.wallTime, now);
    
    if (this.clock.wallTime === observed.wallTime) {
      // Same physical time, increment logical counter past the observed value
      this.clock.logical = Math.max(this.clock.logical, observed.logical) + 1;
    } else if (this.clock.wallTime === now) {
      // Our physical time won, just increment logical counter
      this.clock.logical += 1;
    } else {
      // We took observed time, reset logical counter
      this.clock.logical = 0;
    }
  }
  
  /**
   * Increment the logical clock - used when creating new timestamps
   * @private
   */
  private tickClock(): void {
    const now = Date.now();
    
    if (now > this.clock.wallTime) {
      // Physical time has advanced, update wall time and reset logical component
      this.clock.wallTime = now;
      this.clock.logical = 0;
    } else {
      // Physical time hasn't advanced (or has gone backward), just increment logical component
      this.clock.logical += 1;
    }
  }
  
  /**
   * Get all active transactions
   * @returns Map of active transactions
   */
  getActiveTransactions(): Map<string, Transaction> {
    return new Map(this.activeTransactions);
  }
  
  /**
   * Check if a transaction is still active
   * @param transactionId Transaction ID to check
   * @returns True if transaction is active
   */
  isTransactionActive(transactionId: string): boolean {
    return this.activeTransactions.has(transactionId);
  }
  
  /**
   * Get the number of active transactions
   * @returns Count of active transactions
   */
  getActiveTransactionCount(): number {
    return this.activeTransactions.size;
  }
}