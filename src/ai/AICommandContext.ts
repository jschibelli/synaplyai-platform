/**
 * Parameters for gathering context for AI commands
 */
export interface AICommandContextParameters {
  windowSize: number;
  includePreceding: boolean;
  includeFollowing: boolean;
  includeDocument: boolean;
  includeMetadata?: boolean;
  detectIntent?: boolean;
  fallbackToPartialContext?: boolean;
  position?: number;
  [key: string]: any;
}

/**
 * Context data structure for AI commands
 */
export interface AICommandContext {
  documentId: string;
  userId: string;
  tenantId: string;
  document?: {
    content: string;
    metadata?: any;
  };
  selection?: {
    start: number;
    end: number;
    text: string;
  };
  aiAnalysisResult?: any;
  selectedText?: string;
  precedingText?: string;
  followingText?: string;
  documentMetadata?: any;
  onProgress?: (update: string) => void;
  onToken?: (token: any) => void;
  [key: string]: any;
}

/**
 * Parameters for AI analysis
 */
export interface AIAnalysisParameters {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  prompt?: string;
  systemPrompt?: string;
  includeMetadata?: boolean;
  onToken?: (token: string) => void;
  [key: string]: any; // Allow additional properties for tests
}

/**
 * Default context parameters
 */
export const defaultContextParameters: AICommandContextParameters = {
  windowSize: 1000,
  includePreceding: true,
  includeFollowing: true,
  includeDocument: true,
  includeMetadata: false
};