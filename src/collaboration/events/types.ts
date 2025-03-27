export interface DocumentEvent {
  id: string;
  documentId: string;
  userId: string;
  timestamp: number;
  type: string;
  position?: number;
  length?: number;
  text?: string;
  startPosition?: number;
  endPosition?: number;
  operation?: any;
  vectorClock?: Record<string, number>;
  version?: number;
  metadata?: Record<string, any>;
}

export interface TextInsertedEvent extends DocumentEvent {
  type: 'TEXT_INSERTED';
  position: number;
  text: string;
}

export interface TextDeletedEvent extends DocumentEvent {
  type: 'TEXT_DELETED';
  position: number;
  length: number;
  deletedText: string;
}

export interface TextReplacedEvent extends DocumentEvent {
  type: 'TEXT_REPLACED';
  startPosition: number;
  endPosition: number;
  newText: string;
  oldText: string;
}

export interface TextFormattedEvent extends DocumentEvent {
  type: 'TEXT_FORMATTED';
  startPosition: number;
  endPosition: number;
  formatting: Record<string, any>;
}

export interface BlockMovedEvent extends DocumentEvent {
  type: 'BLOCK_MOVED';
  startPosition: number;
  endPosition: number;
  targetPosition: number;
}

export interface BlockInsertedEvent extends DocumentEvent {
  type: 'BLOCK_INSERTED';
  position: number;
  blockType: string;
  blockContent: any;
}

export interface MetadataUpdatedEvent extends DocumentEvent {
  type: 'METADATA_UPDATED';
  key: string;
  value: any;
  previousValue?: any;
}