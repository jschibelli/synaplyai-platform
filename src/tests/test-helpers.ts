import { 
  AIAnalysisResult, 
  AICommandContextParameters,
  CompleteTextCommand,
  RewriteTextCommand,
  GrammarCheckCommand,
  SemanticRewriteCommand,
  ConflictType,
  ResolutionType
} from './test-interfaces';

/**
 * Creates a standard AIAnalysisResult for tests
 */
export function createCompleteAnalysisResult(
  content: string, 
  metadata: Record<string, any> = {}
): AIAnalysisResult {
  return {
    content,
    modelId: 'gpt-4',
    totalTokens: 100,
    promptTokens: 50,
    completionTokens: 50,
    metadata
  };
}

/**
 * Creates standard context parameters with all required fields
 */
export function createStandardContextParameters(
  overrides: Partial<AICommandContextParameters> = {}
): AICommandContextParameters {
  return {
    windowSize: 1000,
    includePreceding: true,
    includeFollowing: true,
    includeDocument: true,
    // Add commonly needed optional parameters
    includeMetadata: false,
    detectIntent: false,
    fallbackToPartialContext: false,
    ...overrides
  };
}

/**
 * Creates a complete text command for testing
 */
export function createCompleteTextCommand(
  props: Partial<CompleteTextCommand> = {}
): CompleteTextCommand {
  return {
    type: 'COMPLETE_TEXT',
    documentId: props.documentId || 'doc-1',
    userId: props.userId || 'user-1',
    position: props.position ?? 0, // Use nullish coalescing to ensure position is defined
    prompt: props.prompt || 'Complete this text',
    contextParameters: {
      windowSize: props.contextParameters?.windowSize || 100,
      includePreceding: props.contextParameters?.includePreceding ?? true,
      includeFollowing: props.contextParameters?.includeFollowing ?? false,
      includeDocument: props.contextParameters?.includeDocument ?? true // Add missing property
    },
    analysisParameters: props.analysisParameters || {
      type: 'GENERATE_TEXT',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 100
    },
    requiresAIAnalysis: true,
    ...props
  };
}

/**
 * Creates a rewrite text command for testing
 */
export function createRewriteTextCommand(
  overrides: Partial<RewriteTextCommand> = {}
): RewriteTextCommand {
  return {
    type: 'REWRITE_TEXT',
    documentId: 'doc-123',
    userId: 'user-1',
    selectionStart: 10,
    selectionEnd: 20,
    instructions: 'Make this more concise',
    contextParameters: createStandardContextParameters(),
    requiresAIAnalysis: true,
    analysisParameters: {
      type: 'REWRITE_SELECTION',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 100
    },
    ...overrides
  };
}

/**
 * Creates a grammar check command with all required properties
 */
export function createGrammarCheckCommand(
  overrides: Partial<GrammarCheckCommand> = {}
): GrammarCheckCommand {
  return {
    type: 'GRAMMAR_CHECK',
    documentId: 'doc-123',
    userId: 'user-1',
    selectionStart: 10,
    selectionEnd: 100,
    contextParameters: createStandardContextParameters(),
    requiresAIAnalysis: true,
    analysisParameters: {
      type: 'CHECK_GRAMMAR',
      model: 'gpt-4'
    },
    ...overrides
  };
}

/**
 * Creates a semantic rewrite command for testing
 */
export function createSemanticRewriteCommand(
  overrides: Partial<SemanticRewriteCommand> = {}
): SemanticRewriteCommand {
  return {
    type: 'SEMANTIC_REWRITE',
    documentId: 'doc-123',
    userId: 'user-1',
    selectionStart: 10,
    selectionEnd: 20,
    intent: {
      tone: 'formal',
      style: 'concise',
      audience: 'expert'
    },
    contextParameters: createStandardContextParameters({
      preserveStructure: true
    }),
    requiresAIAnalysis: true,
    ...overrides
  };
}

/**
 * Creates test document context with standard properties
 */
export function createDocumentContext(content: string = 'Test content') {
  return {
    content,
    documentId: 'test-doc-1',
    userId: 'test-user-1',
    tenantId: 'test-tenant-1',
    metadata: {}
  };
}

/**
 * Creates a mock conflict for testing
 */
export function createMockConflict(
  overrides: Partial<ConflictType> = {}
): ConflictType {
  return {
    id: 'conflict-123',
    type: 'text-conflict',
    localContent: 'This is local content',
    remoteContent: 'This is remote content',
    operations: [],
    tokens: [
      { id: 'token-1', text: 'This', state: 'unchanged' },
      { id: 'token-2', text: 'is', state: 'unchanged' },
      { id: 'token-3', text: 'local', state: 'conflict' },
      { id: 'token-4', text: 'content', state: 'unchanged' }
    ],
    ...overrides
  };
}

/**
 * Creates a mock resolution for testing
 */
export function createMockResolution(
  overrides: Partial<ResolutionType> = {}
): ResolutionType {
  return {
    conflictId: 'conflict-123',
    strategy: 'accept-local',
    content: 'This is local content',
    ...overrides
  };
}

const grammarCheckCommand = createGrammarCheckCommand({
  documentId: testDocumentId,
  userId: testUserId,
  selectionStart: 40,
  selectionEnd: 90,
  contextParameters: {
    windowSize: 200,
    includePreceding: true,
    includeFollowing: true
  },
  analysisParameters: {
    type: 'CHECK_GRAMMAR',
    model: 'gpt-3.5-turbo',
    temperature: 0.3,
    maxTokens: 100,
    cache: true
  }
});