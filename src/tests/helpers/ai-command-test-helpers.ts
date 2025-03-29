import { DocumentContext } from '../../ai/ContextProvider';
import { BaseAIAnalysisResult } from '../../ai/AIService';

/**
 * Test helper functions and interfaces for AI commands
 */

export interface AIAnalysisResult extends BaseAIAnalysisResult {
  content: string;
  modelId: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  metadata?: Record<string, any>;
}

export interface AICommandContext {
  tenantId: string;
  documentId?: string;
  userId?: string;
  content?: string;
  selectedText?: string;
  precedingText?: string;
  followingText?: string;
  documentMetadata?: Record<string, any>;
  [key: string]: any; // Allow additional properties for tests
}

export interface AICommandContextParameters {
  windowSize: number;
  includePreceding: boolean;
  includeFollowing: boolean;
  includeDocument?: boolean;
  position?: number;
  selectionStart?: number;
  selectionEnd?: number;
  validateStructure?: boolean;
}

export type AICommandHandler<T, R> = {
  execute: (command: T, context: Partial<AICommandContext>, analysis?: AIAnalysisResult) => Promise<R>
};

/**
 * Creates a mock AI analysis result for testing
 */
export function createMockAnalysisResult(content: string, options: Partial<AIAnalysisResult> = {}): AIAnalysisResult {
  return {
    content,
    modelId: options.modelId || 'gpt-4',
    totalTokens: options.totalTokens || 100,
    promptTokens: options.promptTokens || 50,
    completionTokens: options.completionTokens || 50,
    metadata: options.metadata || {
      responseTime: 450,
      operationId: 'test-op-123'
    }
  };
}

/**
 * Creates mock standard context parameters for testing
 */
export function createStandardContextParameters(overrides: Partial<AICommandContextParameters> = {}): AICommandContextParameters {
  return {
    windowSize: overrides.windowSize || 200,
    includePreceding: overrides.includePreceding !== undefined ? overrides.includePreceding : true,
    includeFollowing: overrides.includeFollowing !== undefined ? overrides.includeFollowing : true,
    includeDocument: overrides.includeDocument || false,
    position: overrides.position,
    selectionStart: overrides.selectionStart,
    selectionEnd: overrides.selectionEnd,
    validateStructure: overrides.validateStructure
  };
}