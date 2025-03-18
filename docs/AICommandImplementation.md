# AI Command Implementation: Strategic Architecture Guide

## Executive Summary

The AI Command Implementation extends the command pattern architecture to seamlessly integrate AI-powered operations into the document editing experience. This architecture enables context-aware AI editing assistance, maintains tenant isolation, and preserves the performance characteristics of the command system while adding intelligent capabilities throughout the editing workflow.

By integrating AI directly into the command pipeline, we achieve several strategic advantages:

1. **Unified Processing Model**: AI commands flow through the same validation, authorization, and execution pipeline as user commands
2. **Context-Aware Operations**: Commands can leverage document semantics for intelligent assistance
3. **Composable Intelligence**: Complex AI operations decompose into granular, auditable commands
4. **Tenant-Specific Behavior**: AI capabilities adapt to tenant preferences and policies
5. **Optimized Performance**: Intelligent context management prevents unnecessary token usage

## Core Components

### 1. AI Command Registry

The AI Command Registry extends the standard command registry with AI-specific capabilities:

```typescript
class AICommandRegistry extends CommandRegistry {
  constructor(
    private aiService: AIService,
    private contextProvider: ContextProvider,
    private usageTracker: UsageTracker
  ) {
    super();
  }

  async registerAICommand<T extends AICommand, E>(
    type: string,
    handler: AICommandHandler<T, E>,
    options: AICommandOptions
  ): Promise<void> {
    // Register with special AI-specific middleware
    this.middleware.push(
      createTenantAwareLimiter(),
      createContextCaptureMiddleware(),
      createUsageTrackingMiddleware(this.usageTracker)
    );

    // Register the command handler with AI support
    return super.register(type, this.wrapWithAICapabilities(handler), options);
  }

  private wrapWithAICapabilities<T extends AICommand, E>(
    handler: AICommandHandler<T, E>
  ): CommandHandler<T, E> {
    return async (command: T) => {
      // Capture context based on command parameters
      const context = await this.contextProvider.getContext(
        command.documentId,
        command.contextParameters
      );

      // Execute AI analysis if needed
      if (command.requiresAIAnalysis) {
        const analysis = await this.aiService.analyze(context, command.analysisParameters);
        return handler(command, context, analysis);
      }

      // Execute without analysis for simpler commands
      return handler(command, context);
    };
  }
}

// Token usage tracking middleware
function createUsageTrackingMiddleware(usageTracker: UsageTracker) {
  return async (command: AICommand, next: NextFunction) => {
    // Pre-execution tracking
    await usageTracker.trackRequestStart({
      tenantId: getTenantContext().tenantId,
      commandType: command.type,
      estimatedTokens: estimateCommandTokens(command)
    });
    
    try {
      // Execute command
      const result = await next(command);
      
      // Post-execution tracking
      await usageTracker.trackRequestComplete({
        tenantId: getTenantContext().tenantId,
        commandType: command.type,
        actualTokens: countResultTokens(result),
        success: true
      });
      
        ...insertResult.metadata,
        aiGenerated: true,
        prompt: command.prompt,
        modelId: analysis.modelIduestComplete({
      } tenantId: getTenantContext().tenantId,
    };  commandType: command.type,
  };    success: false,
        error: error.message
// Rewrite selection handler
const rewriteSelectionHandler: AICommandHandler<RewriteSelectionCommand, TextReplacedEvent> = 
  async (command, context, analysis) => {
    // Use AI to rewrite the selected text
    const rewrittenText = analysis.content;
    
    // Create a replace text command from AI result
    const replaceCommand: ReplaceTextCommand = {
      type: 'REPLACE_TEXT',imiter() {
      documentId: command.documentId,ext: NextFunction) => {
      startPosition: command.startPosition,antId;
      endPosition: command.endPosition,
      newText: rewrittenText,tenant
      userId: command.userIdteLimiter.checkLimit(tenantId, command.type);
    };
    if (!allowed) {
    // Execute standard commandit exceeded for ${command.type}`);
    const replaceResult = await commandRegistry.execute(replaceCommand);
    
    // Return event with AI-specific metadata
    return {ext(command);
      ...replaceResult,
      metadata: {
        ...replaceResult.metadata,
        aiGenerated: true,andler
        instructions: command.instructions,<CompleteTextCommand, TextCompletedEvent> = 
  async (command, context, analysis) => {
    // Use AI analysis to generate appropriate text completion
    const generatedText = analysis.content;
    
    // Create a standard insert text command from AI result
    const insertCommand: InsertTextCommand = {
      type: 'INSERT_TEXT',gistry
      documentId: command.documentId,
      position: command.position,iService,
      text: generatedText,  contextProvider,
      userId: command.userId
    };
    
    // Execute the standard command
    const insertResult = await commandRegistry.execute(insertCommand);mmandRegistry.registerAICommand<CompleteTextCommand, TextCompletedEvent>(
    
    // Return event with AI-specific metadataompleteTextHandler,
    return {  {
      ...insertResult,
      metadata: {
        ...insertResult.metadata,
        aiGenerated: true,
        prompt: command.prompt,
        modelId: analysis.modelIdaiCommandRegistry.registerAICommand<RewriteSelectionCommand, TextReplacedEvent>(
      }
    };
  };
 validator: validateRewriteSelectionCommand,
// Rewrite selection handler   authorizer: authorizeAICommand
  }st rewriteSelectionHandler: AICommandHandler<RewriteSelectionCommand, TextReplacedEvent> = 
);async (command, context, analysis) => {);
    // Use AI to rewrite the selected text
aiCommandRegistry.registerAICommand<SummarizeSelectionCommand, TextReplacedEvent>(marizeSelectionCommand, TextReplacedEvent>(
  'SUMMARIZE_SELECTION',
  summarizeSelectionHandler, command from AI result  summarizeSelectionHandler,
  { const replaceCommand: ReplaceTextCommand = {
    validator: validateSummarizeSelectionCommand:onCommand,
    authorizer: authorizeAICommandId,: authorizeAICommand
  }   startPosition: command.startPosition,
);    endPosition: command.endPosition,
```   newText: rewrittenText,
      userId: command.userId
### 2. Context Provider
    
The Context Provider is responsible for extracting and providing the necessary context for AI operations:sary context for AI operations:
    const replaceResult = await commandRegistry.execute(replaceCommand);
```typescript
      activeSectionContent: this.extractActiveSection(document, parameters),
      documentMetadata: document.metadata,
      tenantContextring;ult,
    };mentStructure: DocumentStructure;metadata: {
  }ctiveSectionContent: string;     ...replaceResult.metadata,
  documentMetadata: DocumentMetadata;        aiGenerated: true,
  private extractPrecedingText(document: Document, params: ContextParameters): string {
    // Implement semantic chunk extraction with token limits
    // Use overlapping windows if needed for context continuity
    const position = params.position || document.content.length;
    const windowSize = params.windowSize || 1000;
    private documentRepository: DocumentRepository,
    // Get text before position with intelligent paragraph boundaries
    return this.getSemanticChunk(document, position - windowSize, position);
  }turn this.getSemanticChunk(document, position, position + windowSize);
  async getContext(  }
  private extractFollowingText(document: Document, params: ContextParameters): string {
    // Similar implementation for text after the current positionmentation for text after the current position
    const position = params.position || 0;tences)    const position = params.position || 0;
    const windowSize = params.windowSize || 1000;y(document, start);dowSize || 1000;
    const tenantContext = this.tenantProvider.getCurrentContext();const expandedEnd = this.findNextParagraphBoundary(document, end);
    return this.getSemanticChunk(document, position, position + windowSize);
  }   throw new Error('No tenant context available'); return document.content.substring(expandedStart, expandedEnd);
    }  }
  private getSemanticChunk(document: Document, start: number, end: number): string {
    // Expand to semantic boundaries (paragraphs, sentences) boundaries (paragraphs, sentences)
    const expandedStart = this.findPreviousParagraphBoundary(document, start);
    const expandedEnd = this.findNextParagraphBoundary(document, end);
      tenantContext.tenantId// Create a simplified structural representation    
    return document.content.substring(expandedStart, expandedEnd);
  }
    // Create context based on parameters  private extractActiveSection(document: Document, params: ContextParameters): string {
  // Additional helper methods for structure extraction
  private extractStructure(document: Document): DocumentStructure {), Document): DocumentStructure {
    // Extract headings, sections, lists, etc.(document, parameters),tc.
    // Create a simplified structural representationent),
  }   activeSectionContent: this.extractActiveSection(document, parameters),
      documentMetadata: document.metadata,
  private extractActiveSection(document: Document, params: ContextParameters): string {
    // Get the content of the current section based on cursor position
    // Uses semantic section detectionanalysis, prompt preparation, and interaction with AI models:
  }
} private extractPrecedingText(document: Document, params: ContextParameters): string {``typescript
 // Implement semantic chunk extraction with token limitsss AIService {
function optimizeContextWindow(    // Use overlapping windows if needed for context continuity  constructor(
  document: Document,n = params.position || document.content.length;itBreaker: CircuitBreaker,### 3. AI Service
  position: number,    const windowSize = params.windowSize || 1000;    private metricsCollector: MetricsCollector,
  requestedSize: number,
  maxTokens: number    // Get text before position with intelligent paragraph boundaries    private tokenLimiter: TokenLimiter,
): string {is.getSemanticChunk(document, position - windowSize, position);ilterPipeline: ContentFilterPipeline
  // Start with the requested window
  let context = document.getTextWindow(position, requestedSize);
  cument, params: ContextParameters): string { CircuitBreaker,
  // Estimate tokense current positionollector,
  let estimatedTokens = estimateTokens(context);FlagService,
  e || 1000;enLimiter,
  if (estimatedTokens <= maxTokens) {
    return context;turn this.getSemanticChunk(document, position, position + windowSize);nst operationId = generateUuid();
  }  }    const startTime = performance.now();
  entCounter('ai.analysis.started', {
  // If too large, implement intelligent trimming:  private getSemanticChunk(document: Document, start: number, end: number): string {      tenantId: context.tenantContext.tenantId,
  // 1. Try reducing to semantic boundaries (paragraphs)    // Expand to semantic boundaries (paragraphs, sentences)      operationType: parameters.type
  context = reduceToNearestParagraphBoundaries(context, maxTokens);    const expandedStart = this.findPreviousParagraphBoundary(document, start);    });
  estimatedTokens = estimateTokens(context);    const expandedEnd = this.findNextParagraphBoundary(document, end);
          try {
  if (estimatedTokens <= maxTokens) {    return document.content.substring(expandedStart, expandedEnd);      // Check if feature is enabled for tenant
    return context;  }      if (!await this.featureFlags.isEnabled(
  }        `ai-command.${parameters.type}`,
    // Additional helper methods for structure extraction        context.tenantContext.tenantId
  // 2. Try extracting key sections (headings and their content)  private extractStructure(document: Document): DocumentStructure {      )) {
  context = extractKeyHeadingsAndContent(document, position, maxTokens);    // Extract headings, sections, lists, etc.        throw new Error(`AI command type ${parameters.type} is not enabled for this tenant`);
  estimatedTokens = estimateTokens(context);    // Create a simplified structural representation      }
    }
  if (estimatedTokens <= maxTokens) {      // Check token usage limits
    return context;  private extractActiveSection(document: Document, params: ContextParameters): string {      const estimatedTokens = this.estimateTokens(context, parameters);
  }    // Get the content of the current section based on cursor position      await this.tokenLimiter.checkAndReserveTokens(
      // Uses semantic section detection        context.tenantContext.tenantId,
  // 3. Last resort: truncate with preference to text around cursor  }        estimatedTokens
  return truncateAroundPosition(context, position, maxTokens);}      );
}```
```      // Prepare prompt with tenant-specific customizations
### 3. AI Service      const prompt = await this.preparePrompt(context, parameters);
### 3. AI Service
The AI Service handles the execution of AI operations, including context analysis, prompt preparation, and interaction with AI models:      // Filter prompt through content filter
The AI Service handles the execution of AI operations, including context analysis, prompt preparation, and interaction with AI models:      const filterResult = await this.filterPipeline.process(prompt);
```typescript      if (filterResult.result === 'BLOCKED') {
```typescriptclass AIService {        throw new Error(`Content filter blocked prompt: ${filterResult.reason}`);
class AIService {  constructor(      }
  constructor(    private circuitBreaker: CircuitBreaker,
    private circuitBreaker: CircuitBreaker,    private metricsCollector: MetricsCollector,      // Execute AI operation through circuit breaker
    private metricsCollector: MetricsCollector,    private featureFlags: FeatureFlagService,      const result = await this.circuitBreaker.execute(async () => {
    private featureFlags: FeatureFlagService,    private tokenLimiter: TokenLimiter,        return this.executeAIOperation(prompt, parameters);
    private tokenLimiter: TokenLimiter,    private filterPipeline: ContentFilterPipeline      });
    private filterPipeline: ContentFilterPipeline  ) {}
  ) {}      // Filter result through content filter
  async analyze(      const responseFilterResult = await this.filterPipeline.process(result.content);
  async analyze(      if (responseFilterResult.result === 'BLOCKED') {
        throw new Error(`Content filter blocked AI response: ${responseFilterResult.reason}`);
      }

      // Track successful completion
      const duration = performance.now() - startTime;
      this.metricsCollector.recordValue('ai.analysis.duration', duration, {
        tenantId: context.tenantContext.tenantId,
        operationType: parameters.type
      });

      return result;
    } catch (error) {
      // Track failure
      this.metricsCollector.incrementCounter('ai.analysis.error', {
        tenantId: context.tenantContext.tenantId,
        operationType: parameters.type,
        errorType: error.name
      });

      throw error;
    }
  }

  private async preparePrompt(
    context: DocumentContext,
    parameters: AIAnalysisParameters
  ): string {
    // Get tenant-specific prompt template
    const template = await this.getPromptTemplate(
      parameters.type,
      context.tenantContext.tenantId
    );

    // Fill template with context and parameters
    return this.renderPromptTemplate(template, context, parameters);
  }

  private async executeAIOperation(
    prompt: string,
    parameters: AIAnalysisParameters
  ): Promise<AIAnalysisResult> {
    // Select appropriate model based on parameters and tenant settings
    const model = await this.selectAppropriateModel(parameters);

    // Execute request to AI provider
    return await model.complete(prompt, parameters.completionOptions);
  }
}
```

### 4. AI Command Interfaces

The AI Command Interfaces define the structure of various AI-powered commands:

```typescript
interface AICommand extends Command {
  requiresAIAnalysis: boolean;
  analysisParameters?: AIAnalysisParameters;
  contextParameters: ContextParameters;
}

interface CompleteTextCommand extends AICommand {
  position: number;
  prefixLength: number;
  prompt?: string;
  styleCriteria?: StyleCriteria;
}

interface RewriteSelectionCommand extends AICommand {
  startPosition: number;
  endPosition: number;
  originalText: string;
  instructions: string;
  styleCriteria?: StyleCriteria;
}

interface SummarizeSelectionCommand extends AICommand {
  startPosition: number;
  endPosition: number;
  targetLength?: number;
  format?: 'paragraph' | 'bullets' | 'numbered';
}

interface GenerateFromOutlineCommand extends AICommand {
  outline: string[];
  targetSection: string;
  tone?: string;
  length?: number;
}

interface ImproveWritingCommand extends AICommand {
  startPosition: number;
  endPosition: number;
  aspects: ('clarity' | 'conciseness' | 'grammar' | 'tone')[];
  intensity?: number; // 1-10 scale for how aggressive the changes should be
}
```

### 5. AI Command Cache

The AI Command Cache provides caching capabilities for AI command results to improve performance and reduce redundant computations:

```typescript
class AICommandCache {
  private cache: Map<string, CachedResult> = new Map();
  
  async getOrExecute<T extends AICommand, R>(
    command: T,
    executor: () => Promise<R>
  ): Promise<R> {
    // Generate cache key from command properties
    const cacheKey = this.generateCacheKey(command);
    
    // Check for cached result
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult && !this.isExpired(cachedResult)) {
      return cachedResult.result as R;
    }
    
    // Execute command
    const result = await executor();
    
    // Cache result
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      commandType: command.type
    });
    
    return result;
  }
  
  private generateCacheKey(command: AICommand): string {
    // Create a unique key based on command properties
    // Include tenant ID for isolation
    return `${getTenantContext().tenantId}:${command.type}:${
      createHash(JSON.stringify(command))
    }`;
  }
  
  private isExpired(cachedResult: CachedResult): boolean {
    const ttl = this.getTtlForCommandType(cachedResult.commandType);
    return Date.now() - cachedResult.timestamp > ttl;
  }
  
  private getTtlForCommandType(type: string): number {
    // Different TTLs for different command types
    switch (type) {
      case 'COMPLETE_TEXT':
        return 1000 * 60 * 5; // 5 minutes
      case 'SUMMARIZE_SELECTION':
        return 1000 * 60 * 15; // 15 minutes
      default:
        return 1000 * 60 * 10; // 10 minutes
    }
  }
}
```

### 6. AI Command Batcher

The AI Command Batcher groups similar AI commands together to optimize execution and reduce latency:

```typescript
class AICommandBatcher {
  private batches: Map<string, BatchEntry[]> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  
  async scheduleCommand<T extends AICommand>(
    command: T,
    executor: (commands: T[]) => Promise<any[]>
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const batchKey = this.getBatchKey(command);
      
      // Initialize batch if needed
      if (!this.batches.has(batchKey)) {
        this.batches.set(batchKey, []);
      }
      
      // Add to batch
      const batch = this.batches.get(batchKey)!;
      batch.push({
        command,
        resolve,
        reject
      });
      
      // Reset timer
      if (this.timers.has(batchKey)) {
        clearTimeout(this.timers.get(batchKey)!);
      }
      
      // Set timeout to process batch
      this.timers.set(
        batchKey,
        setTimeout(() => this.processBatch(batchKey, executor), 50)
      );
    });
  }
  
  private async processBatch(
    batchKey: string,
    executor: (commands: AICommand[]) => Promise<any[]>
  ): Promise<void> {
    const batch = this.batches.get(batchKey) || [];
    this.batches.delete(batchKey);
    this.timers.delete(batchKey);
    
    if (batch.length === 0) {
      return;
    }
    
    try {
      // Execute batch
      const commands = batch.map(entry => entry.command);
      const results = await executor(commands);
      
      // Resolve promises
      batch.forEach((entry, index) => {
        entry.resolve(results[index]);
      });
    } catch (error) {
      // Reject all promises in batch
      batch.forEach(entry => {
        entry.reject(error);
      });
    }
  }
  
  private getBatchKey(command: AICommand): string {
    // Group commands by type and document
    return `${getTenantContext().tenantId}:${command.documentId}:${command.type}`;
  }
}
```

### 7. Tenant AI Limiter

The Tenant AI Limiter enforces tenant-specific limits on AI command usage to ensure fair resource allocation and prevent abuse:

```typescript
class TenantAILimiter {
  constructor(
    private tenantSettingsService: TenantSettingsService,
    private usageRepository: UsageRepository,
    private featureFlags: FeatureFlagService
  ) {}
  
  async checkCommandLimit(
    command: AICommand,
    tenantId: string
  ): Promise<void> {
    // Check if AI feature is enabled for tenant
    const featureEnabled = await this.featureFlags.isEnabled(
      'ai-commands',
      tenantId
    );
    
    if (!featureEnabled) {
      throw new Error('AI commands are not enabled for this tenant');
    }
    
    // Get tenant-specific limits
    const limits = await this.tenantSettingsService.getAILimits(tenantId);
    
    // Check command-specific limits
    if (limits.commandLimits[command.type]) {
      const commandLimit = limits.commandLimits[command.type];
      
      // Check rate limits
      await this.checkRateLimit(tenantId, command.type, commandLimit.rateLimit);
      
      // Check token limits
      const estimatedTokens = estimateCommandTokens(command);
      await this.checkTokenLimit(tenantId, estimatedTokens, commandLimit.tokenLimit);
    }
  }
  
  private async checkRateLimit(
    tenantId: string,
    commandType: string,
    rateLimit: RateLimit
  ): Promise<void> {
    const usage = await this.usageRepository.getRecentCommandCount(
      tenantId,
      commandType,
      rateLimit.windowMs
    );
    
    if (usage >= rateLimit.maxRequests) {
      throw new Error(`Rate limit exceeded for ${commandType}`);
    }
  }
  
  private async checkTokenLimit(
    tenantId: string,
    estimatedTokens: number,
    tokenLimit: TokenLimit
  ): Promise<void> {
    const usage = await this.usageRepository.getCurrentTokenUsage(
      tenantId,
      tokenLimit.windowMs
    );
    
    if (usage + estimatedTokens > tokenLimit.maxTokens) {
      throw new Error('Token limit exceeded for this time period');
    }
  }
}
```

### 8. Tenant AI Settings

The Tenant AI Settings manage tenant-specific configurations for AI operations, including model preferences and prompt templates:

```typescript
class TenantAISettings {
  constructor(
    private settingsRepository: TenantSettingsRepository,
    private defaultPromptTemplates: Map<string, string>
  ) {}
  
  async getModelPreference(tenantId: string, operationType: string): Promise<string> {
    const settings = await this.settingsRepository.getAISettings(tenantId);
    
    // Check for operation-specific model preference
    if (settings.modelPreferences?.[operationType]) {
      return settings.modelPreferences[operationType];
    }
    
    // Fall back to tenant default model
    if (settings.defaultModel) {
      return settings.defaultModel;
    }
    
    // System default
    return 'gpt-4';
  }
  
  async getPromptTemplate(tenantId: string, templateName: string): Promise<string> {
    const settings = await this.settingsRepository.getAISettings(tenantId);
    
    // Check for tenant-specific template
    if (settings.promptTemplates?.[templateName]) {
      return settings.promptTemplates[templateName];
    }
    
    // Fall back to system default
    const defaultTemplate = this.defaultPromptTemplates.get(templateName);
    if (defaultTemplate) {
      return defaultTemplate;
    }
    
    throw new Error(`No prompt template found for: ${templateName}`);
  }
}
```

### 9. AI Command Tests

The AI Command Tests ensure the correct functionality of AI commands, including context handling and tenant-specific behavior:

```typescript
describe('AI Command - Complete Text', () => {
  let aiCommandRegistry: AICommandRegistry;
  let mockAIService: jest.Mocked<AIService>;
  let mockContextProvider: jest.Mocked<ContextProvider>;
  
  beforeEach(() => {
    // Set up mocks
    mockAIService = createMockAIService();
    mockContextProvider = createMockContextProvider();
    
    // Create registry with mocks
    aiCommandRegistry = new AICommandRegistry(
      mockAIService,
      mockContextProvider,
      createMockUsageTracker()
    );
    
    // Register command handler
    aiCommandRegistry.registerAICommand(
      'COMPLETE_TEXT',
      completeTextHandler,
      { validator: () => ({ valid: true }) }
    );
    
    // Setup tenant context
    setTenantContext('test-tenant');
  });
  
  test('should complete text based on context', async () => {
    // Arrange
    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: 'doc-1',
      userId: 'user-1',
      position: 100,
      prefixLength: 20,
      requiresAIAnalysis: true,
      contextParameters: {
        position: 100,
        windowSize: 500
      }
    };
    
    const mockContext = {
      precedingText: 'This is a test document with',
      followingText: ' some content after the cursor.',
      documentStructure: {} as DocumentStructure,
      activeSectionContent: 'This is a test document with some content after the cursor.',
      documentMetadata: {}




















































































});  });    expect(context.followingText).toBe('This is the final paragraph of the document.');    expect(context.precedingText).toBe('This is the second paragraph with some more content.\n\nThis is the third paragraph near the cursor.');    expect(context.tenantContext.tenantId).toBe('test-tenant');        );      'test-tenant'      'doc-1',    expect(mockDocumentRepository.getDocument).toHaveBeenCalledWith(    // Assert        const context = await contextProvider.getContext('doc-1', params);    // Act        };      windowSize: 200      position: 120, // Position in third paragraph    const params: ContextParameters = {        mockDocumentRepository.getDocument.mockResolvedValue(mockDocument);        };      version: 1      metadata: { title: 'Test Document' },        'This is the final paragraph of the document.',        'This is the third paragraph near the cursor.\n\n' +        'This is the second paragraph with some more content.\n\n' +      content: 'This is a test document with multiple paragraphs.\n\n' +       id: 'doc-1',    const mockDocument = {    // Arrange  test('should extract context with proper tenant isolation', async () => {    });    });      userId: 'test-user'      tenantId: 'test-tenant',    mockTenantProvider.getCurrentContext.mockReturnValue({    // Setup tenant context        );      mockTenantProvider      mockDocumentRepository,    contextProvider = new ContextProvider(        mockTenantProvider = createMockTenantProvider();    mockDocumentRepository = createMockDocumentRepository();  beforeEach(() => {    let mockTenantProvider: jest.Mocked<TenantProvider>;  let mockDocumentRepository: jest.Mocked<DocumentRepository>;  let contextProvider: ContextProvider;describe('Context Provider', () => {});  });    });      }        modelId: 'gpt-4'        prompt: undefined,        aiGenerated: true,      metadata: {      newText: ' completed text based on context.',      position: 100,      userId: 'user-1',      documentId: 'doc-1',      type: 'TEXT_COMPLETED',    expect(result).toEqual({    // Assert        const result = await aiCommandRegistry.execute(command);    // Act        mockAIService.analyze.mockResolvedValue(mockAnalysis);        };      modelId: 'gpt-4'      content: ' completed text based on context.',    const mockAnalysis = {        mockContextProvider.getContext.mockResolvedValue(mockContext);        };      tenantContext: { tenantId: 'test-tenant' }
    };
    
    const mockAnalysis = {
      content: 'amazing AI-generated text',
      modelId: 'gpt-4',
      usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 }
    };
    
    // Mock dependencies
    mockContextProvider.getContext.mockResolvedValue(mockContext);
    mockAIService.analyze.mockResolvedValue(mockAnalysis);
    






```});  });      .rejects.toThrow('Token limit exceeded');
    await expect(aiCommandRegistryWithLimits.execute(command))
    // Act & Assert
    
    };      }        windowSize: 1000 // Large context


        position: 100,
      contextParameters: {
      requiresAIAnalysis: true,      prefixLength: 20,      position: 100,
      userId: 'user-1',
      documentId: 'doc-1',




      type: 'COMPLETE_TEXT',
    const command: CompleteTextCommand = {        );
      { validator: () => ({ valid: true }) }
      completeTextHandler,
      'COMPLETE_TEXT',    aiCommandRegistryWithLimits.registerAICommand(
    
    );
      mockUsageTracker
      mockContextProvider,


      mockAIService,    const aiCommandRegistryWithLimits = new AICommandRegistry(        );    // Act
    const result = await aiCommandRegistry.execute(command);


      new Error('Token limit exceeded')
    mockUsageTracker.checkAndReserveTokens.mockRejectedValue(
    const mockUsageTracker = createMockUsageTracker();
    // Arrange
  test('should respect tenant token limits', async () => {
  
  });
    }));
      })
        modelId: 'gpt-4'        aiGenerated: true,
      metadata: expect.objectContaining({
      text: 'amazing AI-generated text',
      documentId: 'doc-1',
    expect(result.event).toEqual(expect.objectContaining({
    
    );
      expect.any(Object)
      mockContext,    
    // Assert
    expect(mockContextProvider.getContext).toHaveBeenCalledWith(
      'doc-1',
      command.contextParameters
    );
    
    expect(mockAIService.analyze).toHaveBeenCalledWith(