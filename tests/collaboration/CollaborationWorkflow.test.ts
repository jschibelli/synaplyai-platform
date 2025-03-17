import { Operation } from '../../src/collaboration/conflict/OperationalTransform';
import { ConflictDetector, VersionedOperation } from '../../src/collaboration/conflict/ConflictDetector';
import { VectorClock } from '../../src/collaboration/conflict/VectorClock';

class CollaborativeDocument {
  private content: string = '';
  private ot = new ConflictDetector();
  
  constructor(initialContent: string = '') {
    this.content = initialContent;
  }
  
  applyOperation(op: Operation): void {
    if (op.type === 'insert') {
      this.content = this.content.slice(0, op.position) + 
                     op.content + 
                     this.content.slice(op.position);
    } else if (op.type === 'delete') {
      this.content = this.content.slice(0, op.position) + 
                     this.content.slice(op.position + op.length!);
    }
  }
  
  getContent(): string {
    return this.content;
  }
}

describe('Collaboration Workflow', () => {
  test('should handle concurrent edits and produce consistent document', () => {
    // Create two client documents with same initial content
    const clientA = new CollaborativeDocument('Hello world');
    const clientB = new CollaborativeDocument('Hello world');
    
    // Client A clock state
    let clientAClock = new VectorClock({ clientA: 0 });
    
    // Client B clock state
    let clientBClock = new VectorClock({ clientB: 0 });
    
    // Client A makes a change
    const opA: VersionedOperation = {
      operation: { type: 'insert', position: 5, content: ' beautiful' },
      vectorClock: clientAClock.increment('clientA'),
      clientId: 'clientA',
      timestamp: Date.now()
    };
    
    // Apply change locally to client A's document
    clientA.applyOperation(opA.operation);
    clientAClock = opA.vectorClock;
    
    // Meanwhile, client B makes a different change without seeing client A's change
    const opB: VersionedOperation = {
      operation: { type: 'insert', position: 11, content: ' of code' },
      vectorClock: clientBClock.increment('clientB'),
      clientId: 'clientB',
      timestamp: Date.now()
    };
    
    // Apply change locally to client B's document
    clientB.applyOperation(opB.operation);
    clientBClock = opB.vectorClock;
    
    // Now both clients sync their changes
    
    // Client A receives client B's operation
    const conflictDetector = new ConflictDetector();
    const resolvedForA = conflictDetector.detectAndResolve(opA, opB);
    
    // Apply transformed operation to client A
    clientA.applyOperation(resolvedForA.transformedIncoming);
    clientAClock = clientAClock.merge(opB.vectorClock);
    
    // Client B receives client A's operation
    const resolvedForB = conflictDetector.detectAndResolve(opB, opA);
    
    // Apply transformed operation to client B
    clientB.applyOperation(resolvedForB.transformedIncoming);
    clientBClock = clientBClock.merge(opA.vectorClock);
    
    // Both clients should have the same document content after sync
    expect(clientA.getContent()).toEqual(clientB.getContent());
    
    // The expected content is "Hello beautiful world of code"
    expect(clientA.getContent()).toEqual('Hello beautiful world of code');
  });

  // Add these additional test cases

  test('should handle complex edit sequences with multiple clients', () => {
    // Create three client documents with same initial content
    const clientA = new CollaborativeDocument('Initial text');
    const clientB = new CollaborativeDocument('Initial text');
    const clientC = new CollaborativeDocument('Initial text');
    
    // Set up vector clocks
    let clockA = new VectorClock({ clientA: 0 });
    let clockB = new VectorClock({ clientB: 0 });
    let clockC = new VectorClock({ clientC: 0 });
    
    // Client A makes edit
    const opA1: VersionedOperation = {
      operation: { type: 'insert', position: 0, content: 'First: ' },
      vectorClock: clockA.increment('clientA'),
      clientId: 'clientA',
      timestamp: Date.now()
    };
    
    // Apply locally to A
    clientA.applyOperation(opA1.operation);
    clockA = opA1.vectorClock;
    
    // Client B makes edit without seeing A's edit
    const opB1: VersionedOperation = {
      operation: { type: 'insert', position: 7, content: ' important' },
      vectorClock: clockB.increment('clientB'),
      clientId: 'clientB',
      timestamp: Date.now()
    };
    
    // Apply locally to B
    clientB.applyOperation(opB1.operation);
    clockB = opB1.vectorClock;
    
    // Client C makes edit without seeing A's or B's edits
    const opC1: VersionedOperation = {
      operation: { type: 'delete', position: 8, length: 4 },
      vectorClock: clockC.increment('clientC'),
      clientId: 'clientC',
      timestamp: Date.now()
    };
    
    // Apply locally to C
    clientC.applyOperation(opC1.operation);
    clockC = opC1.vectorClock;
    
    const conflictDetector = new ConflictDetector();
    
    // Synchronize changes between all clients
    // A receives B's change
    const resolvedAB = conflictDetector.detectAndResolve(opA1, opB1);
    clientA.applyOperation(resolvedAB.transformedIncoming);
    clockA = clockA.merge(opB1.vectorClock);
    
    // A receives C's change (after B's)
    const opB1Prime = {
      operation: resolvedAB.transformedIncoming,
      vectorClock: opB1.vectorClock,
      clientId: opB1.clientId,
      timestamp: opB1.timestamp
    };
    const resolvedAC = conflictDetector.detectAndResolve(opB1Prime, opC1);
    clientA.applyOperation(resolvedAC.transformedIncoming);
    clockA = clockA.merge(opC1.vectorClock);
    
    // B receives A's change
    const resolvedBA = conflictDetector.detectAndResolve(opB1, opA1);
    clientB.applyOperation(resolvedBA.transformedIncoming);
    clockB = clockB.merge(opA1.vectorClock);
    
    // B receives C's change
    const opA1Prime = {
      operation: resolvedBA.transformedIncoming,
      vectorClock: opA1.vectorClock,
      clientId: opA1.clientId,
      timestamp: opA1.timestamp
    };
    const resolvedBC = conflictDetector.detectAndResolve(opA1Prime, opC1);
    clientB.applyOperation(resolvedBC.transformedIncoming);
    clockB = clockB.merge(opC1.vectorClock);
    
    // C receives A's change
    const resolvedCA = conflictDetector.detectAndResolve(opC1, opA1);
    clientC.applyOperation(resolvedCA.transformedIncoming);
    clockC = clockC.merge(opA1.vectorClock);
    
    // C receives B's change
    const opA1PrimeForC = {
      operation: resolvedCA.transformedIncoming,
      vectorClock: opA1.vectorClock,
      clientId: opA1.clientId,
      timestamp: opA1.timestamp
    };
    const resolvedCB = conflictDetector.detectAndResolve(opA1PrimeForC, opB1);
    clientC.applyOperation(resolvedCB.transformedIncoming);
    clockC = clockC.merge(opB1.vectorClock);
    
    // All documents should converge to the same content
    const finalContent = clientA.getContent();
    expect(clientB.getContent()).toEqual(finalContent);
    expect(clientC.getContent()).toEqual(finalContent);
    
    // Expected content should be "First: Initial important"
    expect(finalContent).toEqual("First: Initial important");
  });
  
  test('should properly handle sequential edits at the same position', () => {
    const doc1 = new CollaborativeDocument('abc');
    const doc2 = new CollaborativeDocument('abc');
    
    let clock1 = new VectorClock({ client1: 0 });
    let clock2 = new VectorClock({ client2: 0 });
    
    // Client 1 inserts at position 1
    const op1: VersionedOperation = {
      operation: { type: 'insert', position: 1, content: '1' },
      vectorClock: clock1.increment('client1'),
      clientId: 'client1',
      timestamp: Date.now()
    };
    
    doc1.applyOperation(op1.operation);
    clock1 = op1.vectorClock;
    
    // Client 2 inserts at position 1 without seeing client 1's change
    const op2: VersionedOperation = {
      operation: { type: 'insert', position: 1, content: '2' },
      vectorClock: clock2.increment('client2'),
      clientId: 'client2',
      timestamp: Date.now()
    };
    
    doc2.applyOperation(op2.operation);
    clock2 = op2.vectorClock;
    
    const conflictDetector = new ConflictDetector();
    
    // Resolve conflicts
    const resolved1 = conflictDetector.detectAndResolve(op1, op2);
    doc1.applyOperation(resolved1.transformedIncoming);
    
    const resolved2 = conflictDetector.detectAndResolve(op2, op1);
    doc2.applyOperation(resolved2.transformedIncoming);
    
    // Documents should converge
    expect(doc1.getContent()).toEqual(doc2.getContent());
  });
  
  test('should handle delete operations across multiple clients', () => {
    const doc1 = new CollaborativeDocument('abcdefgh');
    const doc2 = new CollaborativeDocument('abcdefgh');
    
    let clock1 = new VectorClock({ client1: 0 });
    let clock2 = new VectorClock({ client2: 0 });
    
    // Client 1 deletes characters at position 1-3
    const op1: VersionedOperation = {
      operation: { type: 'delete', position: 1, length: 3 },
      vectorClock: clock1.increment('client1'),
      clientId: 'client1',
      timestamp: Date.now()
    };
    
    doc1.applyOperation(op1.operation);
    clock1 = op1.vectorClock;
    
    // Client 2 deletes characters at position 3-5 without seeing client 1's change
    const op2: VersionedOperation = {
      operation: { type: 'delete', position: 3, length: 3 },
      vectorClock: clock2.increment('client2'),
      clientId: 'client2',
      timestamp: Date.now()
    };
    
    doc2.applyOperation(op2.operation);
    clock2 = op2.vectorClock;
    
    const conflictDetector = new ConflictDetector();
    
    // Resolve conflicts
    const resolved1 = conflictDetector.detectAndResolve(op1, op2);
    doc1.applyOperation(resolved1.transformedIncoming);
    
    const resolved2 = conflictDetector.detectAndResolve(op2, op1);
    doc2.applyOperation(resolved2.transformedIncoming);
    
    // Both documents should have the same content
    expect(doc1.getContent()).toEqual(doc2.getContent());
    expect(doc1.getContent()).toEqual('ah'); // Expecting 'abcdefgh' -> 'ah' after both delete operations
  });
});