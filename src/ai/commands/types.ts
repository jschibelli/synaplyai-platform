/**
 * Command context parameters for AI commands
 */
export interface AICommandContextParameters {
  windowSize: number;
  includePreceding: boolean;
  includeFollowing: boolean;
  includeDocument: boolean;
  includeMetadata?: boolean;
  position?: number;
}

/**
 * Context for AI command execution
 */
export interface AICommandContext {
  selectedText?: string;
  precedingText?: string;
  followingText?: string;
  documentMetadata?: any;
  tenantContext?: {
    tenantId: string;
    userId: string;
  };
  onProgress?: (update: string) => void;
  onToken?: (token: any) => void;
  [key: string]: any;
}

/**
 * AI analysis result type
 */
export interface AIAnalysisResult {
  content: string;
  metadata?: any;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  modelId?: string;
  confidence?: number;
}

/**
 * Types for text completion events
 */
export interface TextCompletedEvent {
  documentId: string;
  userId: string;
  position: number;
  text: string;
  aiGenerated: boolean;
  modelId?: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Analysis parameters for AI commands
 */
export interface AIAnalysisParameters {
  type: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  cache?: boolean;
  content?: string;
  [key: string]: any;
}

/**
 * Handler type for AI commands
 */
export type AICommandHandler<T, R> = (command: T, context: AICommandContext, analysis?: AIAnalysisResult) => Promise<R>;