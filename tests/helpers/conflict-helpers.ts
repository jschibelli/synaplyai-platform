export function createMockDocument(): any {
  return {
    content: 'Mock document content',
    version: 1
  };
}

export function simulateConcurrentEdits(document: any, edits: any[]): any {
  // Implement concurrent edits simulation logic here
  return document;
}