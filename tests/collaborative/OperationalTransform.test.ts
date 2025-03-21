import { OperationalTransform, Operation, InsertOperation, DeleteOperation, ReplaceOperation } from '../../src/collaborative/OperationalTransform';

describe('OperationalTransform', () => {
  describe('transform', () => {
    test('should transform insert against insert correctly', () => {
      const op1: InsertOperation = {
        type: 'insert',
        position: 5,
        text: 'abc',
        userId: 'user1',
        timestamp: 100
      };
      
      const op2: InsertOperation = {
        type: 'insert',
        position: 2,
        text: 'xyz',
        userId: 'user2',
        timestamp: 101
      };
      
      const result = OperationalTransform.transform(op1, op2);
      
      expect(result).toEqual({
        type: 'insert',
        position: 8,  // 5 + length of 'xyz'
        text: 'abc',
        userId: 'user1',
        timestamp: 100
      });
    });

    test('should transform delete against insert correctly', () => {
      const op1: DeleteOperation = {
        type: 'delete',
        position: 5,
        length: 3,
        userId: 'user1',
        timestamp: 100
      };
      
      const op2: InsertOperation = {
        type: 'insert',
        position: 2,
        text: 'xyz',
        userId: 'user2',
        timestamp: 101
      };
      
      const result = OperationalTransform.transform(op1, op2);
      
      expect(result).toEqual({
        type: 'delete',
        position: 8, // 5 + length of 'xyz'
        length: 3,
        userId: 'user1',
        timestamp: 100
      });
    });
    
    test('should transform insert against delete correctly', () => {
      const op1: InsertOperation = {
        type: 'insert',
        position: 8,
        text: 'abc',
        userId: 'user1',
        timestamp: 100
      };
      
      const op2: DeleteOperation = {
        type: 'delete',
        position: 3,
        length: 4,
        userId: 'user2',
        timestamp: 101
      };
      
      const result = OperationalTransform.transform(op1, op2);
      
      expect(result).toEqual({
        type: 'insert',
        position: 4, // 8 - 4 (deletion length)
        text: 'abc',
        userId: 'user1',
        timestamp: 100
      });
    });
    
    test('should handle insert within deletion range correctly', () => {
      const op1: InsertOperation = {
        type: 'insert',
        position: 5,
        text: 'abc',
        userId: 'user1',
        timestamp: 100
      };
      
      const op2: DeleteOperation = {
        type: 'delete',
        position: 3,
        length: 6,
        userId: 'user2',
        timestamp: 101
      };
      
      const result = OperationalTransform.transform(op1, op2);
      
      expect(result).toEqual({
        type: 'insert',
        position: 3, // Move to start of deletion
        text: 'abc',
        userId: 'user1',
        timestamp: 100
      });
    });
  });

  describe('apply', () => {
    test('should apply insert operations correctly', () => {
      const doc = 'Hello world!';
      const op: InsertOperation = {
        type: 'insert',
        position: 5,
        text: ' beautiful',
        userId: 'user1',
        timestamp: 100
      };
      
      const result = OperationalTransform.apply(doc, op);
      expect(result).toBe('Hello beautiful world!');
    });
    
    test('should apply delete operations correctly', () => {
      const doc = 'Hello world!';
      const op: DeleteOperation = {
        type: 'delete',
        position: 5,
        length: 6,
        userId: 'user1',
        timestamp: 100
      };
      
      const result = OperationalTransform.apply(doc, op);
      expect(result).toBe('Hello!');
    });
    
    test('should apply replace operations correctly', () => {
      const doc = 'Hello world!';
      const op: ReplaceOperation = {
        type: 'replace',
        position: 6,
        length: 5,
        text: 'everyone',
        userId: 'user1',
        timestamp: 100
      };
      
      const result = OperationalTransform.apply(doc, op);
      expect(result).toBe('Hello everyone!');
    });
  });
  
  describe('compose', () => {
    test('should compose sequential inserts correctly', () => {
      const op1: InsertOperation = {
        type: 'insert',
        position: 5,
        text: 'abc',
        userId: 'user1',
        timestamp: 100
      };
      
      const op2: InsertOperation = {
        type: 'insert',
        position: 8, // 5 + length of 'abc'
        text: 'xyz',
        userId: 'user1',
        timestamp: 101
      };
      
      const result = OperationalTransform.compose(op1, op2);
      
      expect(result).toEqual({
        type: 'insert',
        position: 5,
        text: 'abcxyz',
        userId: 'user1',
        timestamp: 101
      });
    });
    
    test('should compose sequential deletes correctly', () => {
      const op1: DeleteOperation = {
        type: 'delete',
        position: 5,
        length: 3,
        userId: 'user1',
        timestamp: 100
      };
      
      const op2: DeleteOperation = {
        type: 'delete',
        position: 5,
        length: 2,
        userId: 'user1',
        timestamp: 101
      };
      
      const result = OperationalTransform.compose(op1, op2);
      
      expect(result).toEqual({
        type: 'delete',
        position: 5,
        length: 5,
        userId: 'user1',
        timestamp: 101
      });
    });
  });
  
  describe('integration', () => {
    test('should maintain document convergence with concurrent edits', () => {
      // Initial document
      let doc1 = 'Hello world!';
      let doc2 = 'Hello world!';
      
      // User 1 inserts " beautiful" at position 5
      const op1: InsertOperation = {
        type: 'insert',
        position: 5,
        text: ' beautiful',
        userId: 'user1',
        timestamp: 100
      };
      
      // User 2 changes "world" to "everyone"
      const op2: ReplaceOperation = {
        type: 'replace',
        position: 6,
        length: 5,
        text: 'everyone',
        userId: 'user2',
        timestamp: 100
      };
      
      // Apply operations in different orders
      // User 1's perspective: apply op1 locally, then transform and apply op2
      doc1 = OperationalTransform.apply(doc1, op1);
      const transformedOp2 = OperationalTransform.transform(op2, op1);
      doc1 = OperationalTransform.apply(doc1, transformedOp2);
      
      // User 2's perspective: apply op2 locally, then transform and apply op1
      doc2 = OperationalTransform.apply(doc2, op2);
      const transformedOp1 = OperationalTransform.transform(op1, op2);
      doc2 = OperationalTransform.apply(doc2, transformedOp1);
      
      // Both documents should converge to the same state
      expect(doc1).toBe(doc2);
      expect(doc1).toBe('Hello beautiful everyone!');
    });
  });
});