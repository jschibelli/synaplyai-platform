export interface InsertTextCommand {
  type: 'INSERT_TEXT';
  documentId: string;
  position: number;
  text: string;
  userId: string;
}

export interface ReplaceTextCommand {
  type: 'REPLACE_TEXT';
  documentId: string;
  startPosition: number;
  endPosition: number;
  newText: string;
  userId: string;
}

export interface SummarizeSelectionCommand {
  type: 'SUMMARIZE_SELECTION';
  documentId: string;
  startPosition: number;
  endPosition: number;
  originalText: string;
  userId: string;
  format: string;
}

export interface ImproveWritingCommand {
  type: 'IMPROVE_WRITING';
  documentId: string;
  startPosition: number;
  endPosition: number;
  aspects: string[];
  intensity: string;
  userId: string;
}