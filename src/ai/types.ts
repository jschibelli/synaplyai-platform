import { TenantContext } from '../tenant/TenantContext';

/**
 * Context provided for AI command execution
 */
export interface DocumentContext {
  documentId: string;
  tenantContext: TenantContext;
  precedingText?: string;
  followingText?: string;
  activeSectionContent?: string;
  documentMetadata?: Record<string, any>;
  position?: number;
}

/**
 * Base interface for AI command parameters
 */
export interface AICommandParameters {
  type: string;
  documentId: string;
  userId: string;
}

/**
 * Base interface for AI command results
 */
export interface AICommandResult {
  modelId: string;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Parameters for semantic rewrite operation
 */
export interface SemanticRewriteParameters extends AICommandParameters {
  text?: string;
  targetStyle?: 'professional' | 'academic' | 'conversational' | 'technical' | 'creative' | 'simplified';
  tone?: 'formal' | 'casual' | 'enthusiastic' | 'persuasive' | 'neutral' | 'authoritative';
  level?: number; // 1-3, strength of the rewrite
  preserveFormatting?: boolean;
}

/**
 * Result of semantic rewrite operation
 */
export interface SemanticRewriteResult extends AICommandResult {
  rewrittenText: string;
  originalText: string;
  style?: string;
  tone?: string;
}