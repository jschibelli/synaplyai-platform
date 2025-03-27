import { CircuitState } from '../lib/circuit-breaker';

// Base AI command context parameters
export interface AICommandContextParameters {
  windowSize: number;
  includePreceding: boolean;
  includeFollowing: boolean;
  includeDocument: boolean;
  // Add all optional properties used in tests
  detectIntent?: boolean;
  fallbackToPartialContext?: boolean;
  includeMetadata?: boolean;
  reuseContext?: boolean;
  preserveStructure?: boolean;
  validateStructure?: boolean;
  trackReferences?: boolean;
  [key: string]: any; // Allow any additional properties for testing
}

// Base AI analysis parameters used across different command types
export interface AIAnalysisParameters {
  type: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  cache?: boolean;
  cacheTTL?: number;
  fallbackType?: string;
  // Support any additional properties for test flexibility
  [key: string]: any;
}

// Base AI command interface
export interface AICommand {
  type: string;
  documentId: string;
  userId: string;
  requiresAIAnalysis: boolean; // Make this required since tests expect it
  contextParameters: AICommandContextParameters;
  analysisParameters?: {
    type: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    [key: string]: any;
  };
  [key: string]: any; // Allow additional properties
}

// Text completion command
export interface CompleteTextCommand extends AICommand {
  type: 'COMPLETE_TEXT' | 'AUTO_DETECT';
  position?: number;
  prompt?: string;
  contextParameters: AICommandContextParameters;
  analysisParameters?: {
    type: 'COMPLETE_TEXT' | 'AUTO_DETECT' | string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    retryAttempts?: number;
    [key: string]: any;
  };
  parameters?: {
    type?: string;
    [key: string]: any;
  };
}

// Text rewrite command
export interface RewriteTextCommand extends AICommand {
  type: 'REWRITE_TEXT';
  selectionStart: number;
  selectionEnd: number;
  instructions: string;
  contextParameters: AICommandContextParameters;
  analysisParameters?: AIAnalysisParameters & {
    type: 'REWRITE_SELECTION' | string;
  };
}

// Grammar check command
export interface GrammarCheckCommand extends AICommand {
  type: 'GRAMMAR_CHECK';
  selectionStart: number;
  selectionEnd: number;
  contextParameters: AICommandContextParameters;
  analysisParameters?: AIAnalysisParameters & {
    type: 'CHECK_GRAMMAR' | string;
  };
}

// Semantic rewrite command
export interface SemanticRewriteCommand extends AICommand {
  type: 'SEMANTIC_REWRITE';
  selectionStart?: number;
  selectionEnd?: number;
  position?: number;
  intent?: {
    tone?: 'formal' | 'casual' | 'technical' | string;
    style?: 'concise' | 'detailed' | 'balanced' | string;
    audience?: 'expert' | 'general' | 'beginner' | string;
    generateAlternatives?: boolean;
    maxAlternatives?: number;
    [key: string]: any;
  };
  preserveKeyPoints?: boolean;
  contextParameters: AICommandContextParameters;
}

// AI analysis result
export interface AIAnalysisResult {
  content: string;
  modelId: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  metadata?: Record<string, any>;
  intents?: string[];
  confidence?: number;
  alternatives?: Array<{
    content: string;
    confidence: number;
    preservesIntent: boolean;
  }>;
  [key: string]: any;
}

// AI command context
export interface AICommandContext {
  tenantId: string;
  documentId: string;
  selectedText?: string;
  precedingText?: string;
  followingText?: string;
  onProgress?: (progress: any) => void;
  onToken?: (token: any) => void;
  [key: string]: any;
}

// Mock interfaces for testing
export interface MetricsCollector {
  increment: jest.Mock;
  recordLatency: jest.Mock;
  recordValue: jest.Mock;
  track: jest.Mock;
  incrementCircuitBreakerFailures: jest.Mock;
  incrementCircuitBreakerRejections: jest.Mock;
  setCircuitBreakerState: jest.Mock;
  getCircuitBreakerState?: jest.Mock;
  [key: string]: any;
}

export interface CircuitBreakerInterface {
  execute: jest.Mock;
  getState: jest.Mock;
  recordSuccess: jest.Mock;
  recordFailure: jest.Mock;
  transitionState: jest.Mock;
  shouldAttemptReset: jest.Mock;
  [key: string]: any;
}

export interface CommandRegistryInterface {
  register: jest.Mock;
  execute: jest.Mock;
  [key: string]: any;
}

export interface DocumentEditorProps {
  document?: any;
  documentId?: string;
  userId?: string;
  onConflict?: (conflict: any) => void;
  onResolve?: (resolution: any) => void;
  readOnly?: boolean;
  onChange?: (content: string) => void;
  [key: string]: any;
}

// Test types for conflict resolution
export interface ConflictType {
  id: string;
  type: string;
  localContent: string;
  remoteContent: string;
  operations?: any[];
  tokens?: Array<{id: string, text: string, state: string}>;
  [key: string]: any;
}

export interface ResolutionType {
  conflictId: string;
  strategy: string;
  content?: string;
  [key: string]: any;
}

// Enhanced filter types
export enum ContentFilterResult {
  ALLOWED = 'ALLOWED',
  BLOCKED = 'BLOCKED',
  FLAGGED = 'FLAGGED'
}

export enum ExecutionStrategy {
  SYNC = 'sync',
  PARALLEL = 'parallel'
}

export interface FilterStage {
  name: string;
  executionStrategy: ExecutionStrategy;
  priority: number;
  filter: (content: string) => Promise<{
    result: ContentFilterResult | string;
    confidence: number;
    reason?: string;
  }>;
}

// Add filter-related types to fix tests

export interface FilterResult {
  isAllowed: boolean;
  reasons: string[];
  confidence?: number;
  [key: string]: any;
}

export interface RedisMetricsClient {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  incr: jest.Mock;
  decr: jest.Mock;
  hget: jest.Mock;
  hset: jest.Mock;
  hincrby: jest.Mock;
  pipeline: jest.Mock;
  exec: jest.Mock;
  // Add extra methods needed by tests
  incrementCounter: jest.Mock;
  recordLatency: jest.Mock;
  getPercentileLatency: jest.Mock;
  setCircuitBreakerState: jest.Mock;
  getCircuitBreakerState: jest.Mock;
  getFilterResultCounts: jest.Mock;
  getPipelineLatency: jest.Mock;
  [key: string]: any;
}