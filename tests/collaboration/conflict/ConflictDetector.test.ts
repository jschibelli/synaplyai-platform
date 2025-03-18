import { ConflictDetector, ConflictType } from '../../../src/collaboration/conflict/ConflictDetector';
import { VectorClock } from '../../../src/collaboration/conflict/VectorClock';
import { Operation } from '../../../src/collaboration/conflict/OperationalTransform';
import { MetricsCollector } from '../../../src/metrics/collector';
import { DocumentEvent } from '../../../src/collaboration/events/types';

// Mock dependencies
jest.mock('../../../src/metrics/collector');
jest.mock('../../../src/compliance/logger', () => ({
  ComplianceLogger: {
    log: jest.fn().mockResolvedValue(undefined)
  }
}));

describe('ConflictDetector', () => {
  let conflictDetector: ConflictDetector;
  let metricsCollector: jest.Mocked<MetricsCollector>;
  
  beforeEach(() => {
    // Set up mocks
    metricsCollector = {
      recordLatency: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(undefined),
      recordValue: jest.fn().mockResolvedValue(undefined),
      track: jest.fn().mockResolvedValue(undefined),
      getAverageValue: jest.fn(),
      getCountValue: jest.fn()
    } as unknown as jest.Mocked<MetricsCollector>;
    
    conflictDetector = new ConflictDetector(metricsCollector);
  });
  
  describe('detectConflict', () => {
    test('should detect no conflict when operations are causally related', async () => {
      // Create vector clocks with causal relationship
      const clock1 = new VectorClock({ client1: 1 });
      const clock2 = new VectorClock({ client1: 1, client2: 1 });
      
      const op1: VersionedOperation = {
        operation: { type: 'insert', position: 0, content: 'Hello' },
        vectorClock: clock1,
        clientId: 'client1',
        timestamp: Date.now() - 1000
      };
      
      const op2: VersionedOperation = {
        operation: { type: 'insert', position: 5, content: ' world' },
        vectorClock: clock2,
        clientId: 'client2',
        timestamp: Date.now()
      };
      
      const result = await conflictDetector.detectConflict(op1, op2);
      
      expect(result.hasConflict).toBe(false);
      expect(result.relationship).toBe('before');
      expect(result.conflictType).toBeUndefined();
      
      // Should record metrics
      expect(metricsCollector.recordLatency).toHaveBeenCalledWith(
        'conflict.detection',
        expect.any(Number)
      );
    });
    
    test('should detect TEXT_EDIT conflict for concurrent overlapping inserts', async () => {
      // Create concurrent vector clocks
      const clock1 = new VectorClock({ client1: 1 });
      const clock2 = new VectorClock({ client2: 1 });
      
      const op1: VersionedOperation = {
        operation: { type: 'insert', position: 5, content: 'Hello' },
        vectorClock: clock1,
        clientId: 'client1',
        timestamp: Date.now() - 1000
      };
      
      const op2: VersionedOperation = {
        operation: { type: 'insert', position: 5, content: 'World' },
        vectorClock: clock2,
        clientId: 'client2',
        timestamp: Date.now()
      };
      
      const result = await conflictDetector.detectConflict(op1, op2);
      
      expect(result.hasConflict).toBe(true);
      expect(result.relationship).toBe('concurrent');
      expect(result.conflictType).toBe('TEXT_EDIT');
      expect(result.confidenceScore).toBeGreaterThan(0.5);
    });
    
    test('should detect FORMAT conflict for concurrent formatting of same region', async () => {
      // Create concurrent vector clocks
      const clock1 = new VectorClock({ client1: 1 });
      const clock2 = new VectorClock({ client2: 1 });
      
      const op1: VersionedOperation = {
        operation: { 
          type: 'format', 
          position: 0, 
          length: 5,
          attributes: { bold: true } 
        },
        vectorClock: clock1,
        clientId: 'client1',
        timestamp: Date.now() - 1000
      };
      
      const op2: VersionedOperation = {
        operation: { 
          type: 'format', 
          position: 0, 
          length: 5,
          attributes: { bold: false } 
        },
        vectorClock: clock2,
        clientId: 'client2',
        timestamp: Date.now()
      };
      
      const result = await conflictDetector.detectConflict(op1, op2);
      
      expect(result.hasConflict).toBe(true);
      expect(result.relationship).toBe('concurrent');
      expect(result.conflictType).toBe('FORMAT');
      expect(result.confidenceScore).toBeGreaterThan(0.5);
    });
    
    test('should not detect FORMAT conflict when different attributes are changed', async () => {
      // Create concurrent vector clocks
      const clock1 = new VectorClock({ client1: 1 });
      const clock2 = new VectorClock({ client2: 1 });
      
      const op1: VersionedOperation = {
        operation: { 
          type: 'format', 
          position: 0, 
          length: 5,
          attributes: { bold: true } 
        },
        vectorClock: clock1,
        clientId: 'client1',
        timestamp: Date.now() - 1000
      };
      
      const op2: VersionedOperation = {
        operation: { 
          type: 'format', 
          position: 0, 
          length: 5,
          attributes: { italic: true } 
        },
        vectorClock: clock2,
        clientId: 'client2',
        timestamp: Date.now()
      };
      
      const result = await conflictDetector.detectConflict(op1, op2);
      
      expect(result.hasConflict).toBe(false);
      expect(result.relationship).toBe('concurrent');
      expect(result.conflictType).toBeUndefined();
    });
    
    test('should detect DELETE_MODIFIED conflict when content is deleted and modified concurrently', async () => {
      // Create concurrent vector clocks
      const clock1 = new VectorClock({ client1: 1 });
      const clock2 = new VectorClock({ client2: 1 });
      
      const op1: VersionedOperation = {
        operation: { 
          type: 'delete', 
          position: 0, 
          length: 10
        },
        vectorClock: clock1,
        clientId: 'client1',
        timestamp: Date.now() - 1000
      };
      
      const op2: VersionedOperation = {
        operation: { 
          type: 'insert', 
          position: 5,
          content: 'inserted text'
        },
        vectorClock: clock2,
        clientId: 'client2',
        timestamp: Date.now()
      };
      
      const result = await conflictDetector.detectConflict(op1, op2);
      
      expect(result.hasConflict).toBe(true);
      expect(result.relationship).toBe('concurrent');
      expect(result.conflictType).toBe('DELETE_MODIFIED');
      expect(result.confidenceScore).toBeGreaterThan(0.5);
    });
    
    test('should not detect conflict for operations on different regions', async () => {
      // Create concurrent vector clocks
      const clock1 = new VectorClock({ client1: 1 });
      const clock2 = new VectorClock({ client2: 1 });
      
      const op1: VersionedOperation = {
        operation: { 
          type: 'insert', 
          position: 0, 
          content: 'Hello'
        },
        vectorClock: clock1,
        clientId: 'client1',
        timestamp: Date.now() - 1000
      };
      
      const op2: VersionedOperation = {
        operation: { 
          type: 'insert', 
          position: 20,
          content: 'World'
        },
        vectorClock: clock2,
        clientId: 'client2',
        timestamp: Date.now()
      };
      
      const result = await conflictDetector.detectConflict(op1, op2);
      
      expect(result.hasConflict).toBe(false);
      expect(result.relationship).toBe('concurrent');
      expect(result.conflictType).toBeUndefined();
    });
    
    test('should not detect conflict for operations from the same client', async () => {
      // Create concurrent vector clocks but the same client
      const clock1 = new VectorClock({ client1: 1 });
      const clock2 = new VectorClock({ client1: 2 });
      
      const op1: VersionedOperation = {
        operation: { 
          type: 'insert', 
          position: 5, 
          content: 'Hello'
        },
        vectorClock: clock1,
        clientId: 'client1', // Same client
        timestamp: Date.now() - 1000
      };
      
      const op2: VersionedOperation = {
        operation: { 
          type: 'insert', 
          position: 5,
          content: 'World'
        },
        vectorClock: clock2,
        clientId: 'client1', // Same client
        timestamp: Date.now()
      };
      
      // This should detect the relationship as "after" due to the vector clock
      const result = await conflictDetector.detectConflict(op1, op2);
      
      expect(result.hasConflict).toBe(false);
      expect(result.relationship).toBe('after');
      expect(result.conflictType).toBeUndefined();
    });
  });
});