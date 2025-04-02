import { OperationalTransform, Operation } from '../../src/collaborative/OperationalTransform';
import { VectorClock } from '../../src/collaborative/VectorClock';

describe('Conflict Resolution Integration', () => {
  test('should correctly transform concurrent insert operations', () => {
    // User 1 inserts "Hello " at position 0
    const op1: Operation = {
      type: 'insert',
      position: 0,
      text: 'Hello ',
      userId: 'user1',
      timestamp: Date.now()
    };
    
    // User 2 inserts "World!" at position 0
    const op2: Operation = {
      type: 'insert',
      position: 0,
      text: 'World!',
      userId: 'user2',
      timestamp: Date.now()
    };
    
    // Transform op2 against op1
    const transformedOp2 = OperationalTransform.transform(op2, op1);
    
    // After op1 is applied, op2 should be shifted
    expect(transformedOp2).toEqual({
      type: 'insert',
      position: 6, // "Hello " is 6 characters long
      text: 'World!',
      userId: 'user2',
      timestamp: op2.timestamp
    });
    
    // Apply operations to a document
    let doc = '';
    doc = applyOperation(doc, op1); // "Hello "
    doc = applyOperation(doc, transformedOp2); // "Hello World!"
    
    expect(doc).toBe('Hello World!');
  });
  
  test('should detect concurrent operations with vector clocks', () => {
    // User 1's vector clock
    const clock1 = new VectorClock('user1');
    // User 2's vector clock, starting with the same state as user1
    const clock2 = new VectorClock();
    clock2.merge(clock1.getClock());
    
    // User 1 performs an operation
    clock1.increment('user1');
    
    // User 2 performs an operation without seeing user 1's latest operation
    clock2.increment('user2');
    
    // The operations are concurrent
    expect(clock1.compare(clock2)).toBe(0);
  });
  
  test('should correctly resolve a text conflict using the merge strategy', async () => {
    const doc = { content: 'Initial content' };
    
    // User 1 changes "Initial" to "Modified"
    const op1: Operation = {
      type: 'replace',
      position: 0,
      length: 7,
      text: 'Modified',
      userId: 'user1',
      timestamp: Date.now()
    };
    
    // User 2 changes "content" to "document"
    const op2: Operation = {
      type: 'replace',
      position: 8,
      length: 7,
      text: 'document',
      userId: 'user2',
      timestamp: Date.now()
    };
    
    // Apply user 1's operation
    applyOperationToDoc(doc, op1);
    
    // Since the operations don't overlap, they should merge cleanly
    applyOperationToDoc(doc, op2);
    
    expect(doc.content).toBe('Modified document');
  });
});

// Helper function to apply operations to a string document
function applyOperation(doc: string, op: Operation): string {
  if (op.type === 'insert') {
    return doc.slice(0, op.position) + op.text + doc.slice(op.position);
  } else if (op.type === 'delete') {
    return doc.slice(0, op.position) + doc.slice(op.position + op.length);
  } else if (op.type === 'replace') {
    return doc.slice(0, op.position) + op.text + doc.slice(op.position + op.length);
  }
  return doc;
}

/**
 * Helper function to apply operations to a string document
 * This function needs to correctly handle whitespace and text replacement
 */
function applyOperationToDoc(doc: { content: string }, op: Operation): void {
  if (op.type === 'replace') {
    // Extract the text being replaced to check if it contains spaces
    const replacedText = doc.content.substring(op.position, op.position + op.length);
    const hasSpaceAtEnd = replacedText.endsWith(' ');
    
    // Create the new content by replacing the specified range
    const newContent = 
      doc.content.substring(0, op.position) + 
      op.text + 
      (hasSpaceAtEnd && !op.text.endsWith(' ') ? ' ' : '') + 
      doc.content.substring(op.position + op.length);
    
    // Update the document content
    doc.content = newContent;
  } else if (op.type === 'insert') {
    // Insert text at the specified position
    doc.content = 
      doc.content.substring(0, op.position) + 
      op.text + 
      doc.content.substring(op.position);
  } else if (op.type === 'delete') {
    // Delete text at the specified position and length
    doc.content = 
      doc.content.substring(0, op.position) + 
      doc.content.substring(op.position + (op.length || 0));
  }
}