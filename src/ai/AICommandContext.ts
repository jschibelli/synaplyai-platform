/**
 * Parameters for controlling AI command context
 */
export interface AICommandContextParameters {
  // Required properties
  windowSize: number;
  includePreceding: boolean;
  includeFollowing: boolean;
  includeDocument: boolean;  // <-- This is the missing property in many tests
  
  // Optional properties
  position?: number;
  selectionStart?: number;
  selectionEnd?: number;
  includeMetadata?: boolean;
}

/**
 * Default parameters for AI command context
 */
export const defaultAICommandContextParameters: AICommandContextParameters = {
  windowSize: 100,
  includePreceding: true,
  includeFollowing: true,
  includeDocument: true  // <-- Make sure this is set in the default
};

/**
 * Context for AI commands
 */
export interface AICommandContext {
  documentId: string;
  userId: string;
  tenantId?: string;
  document?: {
    content: string;
    metadata?: Record<string, any>;
  };
  analysis?: any;
  precedingText?: string;
  followingText?: string;
  selectedText?: string;
  onToken?: (token: string) => void;
  onProgress?: (progress: number) => void;
}

/**
 * Default context for AI commands
 */
export const defaultAICommandContext: AICommandContext = {
  documentId: 'doc-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  document: {
    content: 'test content',
    metadata: {}
  }
};

/**
 * Represents the base document context
 */
export interface DocumentContext extends Partial<AICommandContext> {
  documentId: string;
}

/**
 * Function to convert a DocumentContext to an AICommandContext
 */
export function toAICommandContext(context: DocumentContext): AICommandContext {
  return {
    documentId: context.documentId,
    userId: context.userId || 'anonymous',
    tenantId: context.tenantId || 'default',
    ...context
  };
}