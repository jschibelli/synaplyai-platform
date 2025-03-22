export function generateRandomDocument(length: number = 100): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:;-()';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateRandomOperations(docLength: number, count: number = 10): any[] {
  const operations = [];
  for (let i = 0; i < count; i++) {
    const opType = Math.random() > 0.5 ? 'insert' : 'delete';
    const position = Math.floor(Math.random() * docLength);
    
    if (opType === 'insert') {
      const text = generateRandomDocument(Math.floor(Math.random() * 10) + 1);
      operations.push({ type: opType, position, text });
    } else {
      const length = Math.min(Math.floor(Math.random() * 10) + 1, docLength - position);
      operations.push({ type: opType, position, length });
    }
  }
  return operations;
}