import { TenantContext } from '../../lib/tenant-context';

/**
 * Parameters for context gathering
 */
export interface AICommandContextParameters {
  windowSize: number;
  includePreceding: boolean;
  includeFollowing: boolean;
  includeDocument: boolean;
  trackReferences?: boolean;
  trackCollaborativeChanges?: boolean;
  streamResponse?: boolean;
  validateStructure?: boolean;
  trackUserPresence?: boolean;
}

/**
 * Context for AI commands
 */
export interface AICommandContext {
  documentId: string;
  userId: string;
  tenantId: string;
  document?: any;
  selection?: {
    start: number;
    end: number;
    text: string;
  };
  context?: {
    preceding?: string;
    following?: string;
  };
  tenantContext?: TenantContext;
  onProgress?: (progress: any) => void;
  references?: Array<{
    id: string;
    text: string;
    source: string;
  }>;
  collaborativeState?: {
    activeUsers?: string[];
    userCursors?: Record<string, number>;
    userSelections?: Record<string, { start: number; end: number }>;
  };
  featureFlags?: Record<string, boolean>;
}

/**
 * AI analysis result
 */
export interface AIAnalysisResult {
  content: string;
  modelId?: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  metadata?: Record<string, any>;
  cleanup?: () => Promise<void>;
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
 * AI analysis parameters
 */
export interface AIAnalysisParameters {
  type: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
  prompt?: string;
  formatAs?: string;
  additionalInstructions?: string;
  contextEnhancement?: {
    includeFormatting?: boolean;
    includeMetadata?: boolean;
    includeSections?: boolean;
  };
}

/**
 * Handler type for AI commands
 */
export type AICommandHandler<T, R> = (command: T, context: AICommandContext, analysis?: AIAnalysisResult) => Promise<R>;

/**
 * Base AI command options
 */
export interface AICommandOptions {
  type: string;
  contextParameters?: AICommandContextParameters;
  executionParameters?: {
    timeout?: number;
    retries?: number;
    retryDelay?: number;
    priority?: 'high' | 'normal' | 'low';
    cleanupRequired?: boolean;
    rateLimit?: {
      maxRequests: number;
      perTimeWindow: number;
    };
  };
  requiresAIAnalysis: boolean;
}