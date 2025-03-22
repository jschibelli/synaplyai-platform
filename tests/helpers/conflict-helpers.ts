export function createMockDocument() {
  return {
    id: 'doc-123',
    content: 'This is a test document for conflict resolution.',
    version: 1,
    updatedAt: new Date()
  };
}

export function simulateConcurrentEdits(document: any, operations: any[]) {
  const modifiedDocument = { ...document };
  for (const op of operations) {
    if (op.insert) {
      modifiedDocument.content = 
        modifiedDocument.content.slice(0, op.position) + 
        op.insert + 
        modifiedDocument.content.slice(op.position);
    } else if (op.delete) {
      modifiedDocument.content = 
        modifiedDocument.content.slice(0, op.position) + 
        modifiedDocument.content.slice(op.position + op.delete);
    }
  }
  return modifiedDocument;
}