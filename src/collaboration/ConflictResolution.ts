/**
 * Applies an operation to a document and modifies its content.
 * @param doc The document to modify.
 * @param op The operation to apply.
 */
function applyOperationToDoc(doc: any, op: any): void {
  // Modify document content based on the operation type
  switch (op.type) {
    case 'INSERT_TEXT':
      doc.content = insertText(doc.content, op.position, op.text);
      break;
    case 'DELETE_TEXT':
      doc.content = deleteText(doc.content, op.position, op.length);
      break;
    case 'REPLACE_TEXT':
      doc.content = replaceText(doc.content, op.position, op.length, op.text);
      break;
    default:
      throw new Error(`Unsupported operation type: ${op.type}`);
  }
}

/**
 * Inserts text into the document content at the specified position.
 * @param content The original document content.
 * @param position The position to insert the text.
 * @param text The text to insert.
 * @returns The modified document content.
 */
function insertText(content: string, position: number, text: string): string {
  return content.slice(0, position) + text + content.slice(position);
}

/**
 * Deletes text from the document content starting at the specified position.
 * @param content The original document content.
 * @param position The position to start deleting text.
 * @param length The number of characters to delete.
 * @returns The modified document content.
 */
function deleteText(content: string, position: number, length: number): string {
  return content.slice(0, position) + content.slice(position + length);
}

/**
 * Replaces text in the document content starting at the specified position.
 * @param content The original document content.
 * @param position The position to start replacing text.
 * @param length The number of characters to replace.
 * @param text The text to replace with.
 * @returns The modified document content.
 */
function replaceText(content: string, position: number, length: number, text: string): string {
  return content.slice(0, position) + text + content.slice(position + length);
}

export { applyOperationToDoc, insertText, deleteText, replaceText };