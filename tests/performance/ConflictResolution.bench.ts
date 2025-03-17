import { Operation, OperationalTransform } from '../../src/collaboration/conflict/OperationalTransform';
import { ConflictDetector, VersionedOperation } from '../../src/collaboration/conflict/ConflictDetector';
import { VectorClock } from '../../src/collaboration/conflict/VectorClock';

describe('Conflict Resolution Performance', () => {
  test('conflict detection should be under 5ms', () => {
    const ot = new OperationalTransform();
    const detector = new ConflictDetector();
    
    // Create sample operations
    const op1: VersionedOperation = {
      operation: { type: 'insert', position: 10, content: 'test content that is reasonably long' },
      vectorClock: new VectorClock({ client1: 1 }),
      clientId: 'client1',
      timestamp: Date.now()
    };
    
    const op2: VersionedOperation = {
      operation: { type: 'insert', position: 15, content: 'another piece of content to insert' },
      vectorClock: new VectorClock({ client2: 1 }),
      clientId: 'client2',
      timestamp: Date.now()
    };
    
    // Measure detection time
    const iterations = 100;
    const startTime = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      detector.detectAndResolve(op1, op2);
    }
    
    const endTime = performance.now();
    const averageTime = (endTime - startTime) / iterations;
    
    console.log(`Average conflict detection time: ${averageTime.toFixed(3)}ms`);
    expect(averageTime).toBeLessThan(5); // Under 5ms per detection
  });
  
  test('merge operation should be under 50ms for complex merges', () => {
    const detector = new ConflictDetector();
    
    // Create a more complex document with 20 concurrent operations
    const baseOperations: VersionedOperation[] = [];
    const incomingOperations: VersionedOperation[] = [];
    
    // Create 10 base operations
    for (let i = 0; i < 10; i++) {
      const op: VersionedOperation = {
        operation: { 
          type: 'insert', 
          position: i * 5, 
          content: `content-${i}` 
        },
        vectorClock: new VectorClock({ baseClient: i + 1 }),
        clientId: 'baseClient',
        timestamp: Date.now() + i
      };
      baseOperations.push(op);
    }
    
    // Create 10 incoming operations
    for (let i = 0; i < 10; i++) {
      const op: VersionedOperation = {
        operation: { 
          type: i % 2 === 0 ? 'insert' : 'delete', 
          position: i * 7,
          ...(i % 2 === 0 ? { content: `incoming-${i}` } : { length: 3 })
        },
        vectorClock: new VectorClock({ incomingClient: i + 1 }),
        clientId: 'incomingClient',
        timestamp: Date.now() + i
      };
      incomingOperations.push(op);
    }
    
    // Measure merge performance
    const startTime = performance.now();
    const resolvedOps = detector.resolveOperationSequence(baseOperations, incomingOperations);
    const endTime = performance.now();
    
    const mergeTime = endTime - startTime;
    console.log(`Complex merge operation time: ${mergeTime.toFixed(3)}ms`);
    expect(mergeTime).toBeLessThan(50); // Under 50ms
  });
});