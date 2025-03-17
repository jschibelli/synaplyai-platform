import { TransactionManager, HybridLogicalClock } from '../../../src/collaboration/transactions/TransactionManager';
import { MetricsCollector } from '../../../src/metrics/collector';

// Mock dependencies
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $transaction: jest.fn().mockImplementation(() => ({
      $commit: jest.fn().mockResolvedValue(undefined),
      $rollback: jest.fn().mockResolvedValue(undefined)
    }))
  })),
  Prisma: {
    TransactionIsolationLevel: {
      ReadCommitted: 'ReadCommitted'
    }
  }
}));

jest.mock('../../../src/lib/tenant-context', () => ({
  getTenantContext: jest.fn().mockReturnValue({ tenantId: 'test-tenant' })
}));

describe('TransactionManager', () => {
  let transactionManager: TransactionManager;
  let metricsCollector: jest.Mocked<MetricsCollector>;
  let prisma: any;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Set up mocks
    metricsCollector = {
      recordLatency: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(undefined),
      track: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<MetricsCollector>;
    
    // Create prisma mock
    prisma = {
      $transaction: jest.fn().mockImplementation(() => ({
        $commit: jest.fn().mockResolvedValue(undefined),
        $rollback: jest.fn().mockResolvedValue(undefined)
      }))
    };
    
    // Create transaction manager instance
    transactionManager = new TransactionManager(prisma, metricsCollector);
  });
  
  describe('startTransaction', () => {
    test('should create a transaction with proper tenant isolation', async () => {
      const transaction = await transactionManager.startTransaction();
      
      expect(transaction).toBeDefined();
      expect(transaction.tenantId).toBe('test-tenant');
      expect(transaction.id).toMatch(/^tx-node-/);
      expect(prisma.$transaction).toHaveBeenCalledWith('ReadCommitted');
    });
    
    test('should increment metrics when creating a transaction', async () => {
      await transactionManager.startTransaction();
      
      expect(metricsCollector.recordLatency).toHaveBeenCalledWith(
        'transaction.create',
        expect.any(Number)
      );
      expect(metricsCollector.increment).toHaveBeenCalledWith('transaction.active', 1);
    });
  });
  
  describe('executeInTransaction', () => {
    test('should execute function and commit transaction on success', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');
      
      const result = await transactionManager.executeInTransaction(async (tx) => {
        return mockFn(tx);
      });
      
      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalled();
      expect(metricsCollector.recordLatency).toHaveBeenCalledWith(
        'transaction.commit',
        expect.any(Number)
      );
    });
    
    test('should rollback transaction on error', async () => {
      const error = new Error('Test error');
      const mockFn = jest.fn().mockRejectedValue(error);
      
      await expect(
        transactionManager.executeInTransaction(async (tx) => {
          return mockFn(tx);
        })
      ).rejects.toThrow(error);
      
      expect(mockFn).toHaveBeenCalled();
      expect(metricsCollector.recordLatency).toHaveBeenCalledWith(
        'transaction.rollback',
        expect.any(Number)
      );
      expect(metricsCollector.increment).toHaveBeenCalledWith('transaction.rollback.count', 1);
    });
  });
  
  describe('hybridLogicalClock', () => {
    test('should properly update clock on observation', () => {
      // Initial state
      const initialTimestamp = transactionManager.getCurrentTimestamp();
      expect(initialTimestamp.logical).toBe(0);
      
      // Observe a timestamp with higher logical component
      transactionManager.observeClock({
        wallTime: initialTimestamp.wallTime,
        logical: 5,
        nodeId: 'other-node'
      });
      
      // Should increment logical component
      const updatedTimestamp = transactionManager.getCurrentTimestamp();
      expect(updatedTimestamp.wallTime).toBe(initialTimestamp.wallTime);
      expect(updatedTimestamp.logical).toBe(6); // max(0, 5) + 1
      
      // Observe a timestamp with higher wall time
      const futureTime = Date.now() + 10000; // 10 seconds in the future
      transactionManager.observeClock({
        wallTime: futureTime,
        logical: 1,
        nodeId: 'future-node'
      });
      
      // Should take the higher wall time and reset logical component
      const futureTimestamp = transactionManager.getCurrentTimestamp();
      expect(futureTimestamp.wallTime).toBe(futureTime);
      expect(futureTimestamp.logical).toBe(0);
    });
  });
});