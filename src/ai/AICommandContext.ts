/**
 * Context for AI command execution
 */
export interface AICommandContext {
  documentId: string;
  userId: string;
  tenantId: string;
  content?: string;
  selectedText?: string;
  precedingText?: string;
  followingText?: string;
  onProgress?: (progress: any) => void;
  parameters?: AICommandContextParameters;
  tenantContext?: {
    tenantId: string;
    userId: string;
  };
  [key: string]: any; // Allow tests to extend
}

/**
 * Parameters for retrieving document context
 */
export interface AICommandContextParameters {
  windowSize: number;
  includePreceding: boolean;
  includeFollowing: boolean;
  includeDocument?: boolean;
  includeMetadata?: boolean;
  position?: number;
  [key: string]: any; // Allow tests to extend
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