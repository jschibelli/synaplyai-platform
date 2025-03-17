import { Operation } from '../../src/collaboration/conflict/OperationalTransform';
import { ConflictDetector, VersionedOperation } from '../../src/collaboration/conflict/ConflictDetector';
import { VectorClock } from '../../src/collaboration/conflict/VectorClock';

describe('ConflictDetector', () => {
  let conflictDetector: ConflictDetector;
  
  beforeEach(() => {
    conflictDetector = new ConflictDetector();
  });
  
  describe('detectAndResolve', () => {
    test('should identify non-conflicting operations', () => {
      // Sequential operations (client1 then client2)
      const client1Clock = new VectorClock({ client1: 1 });
      const client2Clock = new VectorClock({ client1: 1, client2: 1 });
      
      const baseOp: VersionedOperation = {
        operation: { type: 'insert', position: 0, content: 'Hello ' },
        vectorClock: client1Clock,
        clientId: 'client1',
        timestamp: 1000
      };
      
      const incomingOp: VersionedOperation = {
        operation: { type: 'insert', position: 6, content: 'world' },
        vectorClock: client2Clock,
        clientId: 'client2',
        timestamp: 1100
      };
      
      const result = conflictDetector.detectAndResolve(baseOp, incomingOp);
      
      expect(result.hasConflict).toBe(false);
      expect(result.transformedBase).toEqual(baseOp.operation);
      expect(result.transformedIncoming).toEqual(incomingOp.operation);
    });
    
    test('should transform conflicting insert operations', () => {
      // Concurrent operations from different clients at same position
      const client1Clock = new VectorClock({ client1: 1 });
      const client2Clock = new VectorClock({ client2: 1 });
      
      const baseOp: VersionedOperation = {
        operation: { type: 'insert', position: 0, content: 'Hello' },
        vectorClock: client1Clock,
        clientId: 'client1',
        timestamp: 1000
      };
      
      const incomingOp: VersionedOperation = {
        operation: { type: 'insert', position: 0, content: 'World' },
        vectorClock: client2Clock,
        clientId: 'client2',
        timestamp: 1000
      };
      
      const result = conflictDetector.detectAndResolve(baseOp, incomingOp);
      
      expect(result.hasConflict).toBe(true);
      expect(result.transformedBase).toEqual(baseOp.operation);
      // The incoming operation should be shifted by the length of the base operation
      expect(result.transformedIncoming).toEqual({
        type: 'insert',
        position: 5, // Shifted by length of "Hello"
        content: 'World'
      });
    });
    
    test('should transform insert and delete operations', () => {
      const client1Clock = new VectorClock({ client1: 1 });
      const client2Clock = new VectorClock({ client2: 1 });
      
      const baseOp: VersionedOperation = {
        operation: { type: 'insert', position: 5, content: 'nice ' },
        vectorClock: client1Clock,
        clientId: 'client1',
        timestamp: 1000
      };
      
      const incomingOp: VersionedOperation = {
        operation: { type: 'delete', position: 0, length: 10 },
        vectorClock: client2Clock,
        clientId: 'client2',
        timestamp: 1000
      };
      
      const result = conflictDetector.detectAndResolve(baseOp, incomingOp);
      
      expect(result.hasConflict).toBe(true);
      // Check that the delete operation is properly adjusted to account for the insert
    });
  });
  
  describe('resolveOperationSequence', () => {
    test('should correctly transform a sequence of operations', () => {
      // Setup base operations from client1
      const baseOps: VersionedOperation[] = [
        {
          operation: { type: 'insert', position: 0, content: 'Hello ' },
          vectorClock: new VectorClock({ client1: 1 }),
          clientId: 'client1',
          timestamp: 1000
        },
        {
          operation: { type: 'insert', position: 6, content: 'world' },
          vectorClock: new VectorClock({ client1: 2 }),
          clientId: 'client1',
          timestamp: 1100
        }
      ];
      
      // Concurrent operations from client2
      const incomingOps: VersionedOperation[] = [
        {
          operation: { type: 'insert', position: 0, content: 'Say: ' },
          vectorClock: new VectorClock({ client2: 1 }),
          clientId: 'client2',
          timestamp: 1050
        }
      ];
      
      const transformedOps = conflictDetector.resolveOperationSequence(baseOps, incomingOps);
      
      // The incoming operation should be adjusted to account for both base operations
      expect(transformedOps).toHaveLength(1);
      expect(transformedOps[0]).toEqual({
        type: 'insert',
        position: 0,
        content: 'Say: '
      });
    });
    
    test('should handle multiple conflicting operations', () => {
      // Test with more complex scenarios
    });
  });
});