import { SemanticRewriteCommand, SemanticRewriteCommandHandler } from '../../../src/ai/commands/advanced/semantic-rewrite-command';
import { AIService } from '../../../src/ai/AIService';
import { DocumentContext } from '../../../src/ai/context/DocumentContext';
import { 
  AIAnalysisResult
} from '../../../src/tests/test-interfaces';
import { createCompleteAnalysisResult } from '../../../src/tests/test-helpers';

describe('Semantic Rewrite Command', () => {
  let aiService: jest.Mocked<AIService>;
  let documentContext: jest.Mocked<DocumentContext>;
  let handler: SemanticRewriteCommandHandler;

  beforeEach(() => {
    aiService = {
      analyze: jest.fn()
    } as any;

    documentContext = {
      getContext: jest.fn()
    } as any;

    handler = new SemanticRewriteCommandHandler(aiService, documentContext);
  });

  // Helper function with proper typing
  const createCompleteAnalysisResult = (content: string, metadata = {}) => ({
    content,
    modelId: 'gpt-4',
    totalTokens: 100,
    promptTokens: 50,
    completionTokens: 50,
    metadata
  });

  test('should execute semantic rewrite with key points preservation', async () => {
    const command: SemanticRewriteCommand = {
      type: 'SEMANTIC_REWRITE',
      documentId: 'doc-1',
      userId: 'user-1',
      selectionStart: 0,
      selectionEnd: 100,
      intent: {
        tone: 'formal',
        style: 'concise',
        audience: 'expert'
      },
      preserveKeyPoints: true,
      contextParameters: {
        windowSize: 500,
        includePreceding: true,
        includeFollowing: true,
        includeDocument: true
      },
      requiresAIAnalysis: true
    };

    const mockContext = {
      content: 'Original content with key points'
    };

    const mockKeyPoints = '1. First key point\n2. Second key point';
    const mockRewrite = 'Rewritten formal and concise content';
    const mockComparison = JSON.stringify({
      preserved: true,
      missingPoints: [],
      confidence: 0.95
    });

    documentContext.getContext.mockResolvedValue(mockContext);
    aiService.analyze
      .mockResolvedValueOnce(createCompleteAnalysisResult(mockKeyPoints))  // Extract original key points
      .mockResolvedValueOnce(createCompleteAnalysisResult(mockRewrite))    // Main rewrite
      .mockResolvedValueOnce(createCompleteAnalysisResult(mockKeyPoints))  // Extract rewritten key points
      .mockResolvedValueOnce(createCompleteAnalysisResult(mockComparison)); // Compare key points

    const result = await handler.execute(command);

    expect(result.text).toBe(mockRewrite);
    expect(result.metadata).toMatchObject({
      tone: 'formal',
      style: 'concise',
      audience: 'expert',
      keyPointsPreserved: true
    });
  });

  test('should throw error when key points are not preserved', async () => {
    const command: SemanticRewriteCommand = {
      type: 'SEMANTIC_REWRITE',
      documentId: 'doc-1',
      userId: 'user-1',
      selectionStart: 0,
      selectionEnd: 100,
      intent: {
        tone: 'formal',
        style: 'concise',
        audience: 'expert'
      },
      preserveKeyPoints: true,
      contextParameters: {
        windowSize: 500,
        includePreceding: true,
        includeFollowing: true,
        includeDocument: true
      },
      requiresAIAnalysis: true
    };

    const mockContext = {
      content: 'Original content with key points about A, B, and C'
    };

    const mockOriginalKeyPoints = '1. Point about A\n2. Point about B\n3. Point about C';
    const mockRewrite = 'Rewritten content that misses some points';
    const mockRewrittenKeyPoints = '1. Point about A\n2. Point about B';
    const mockComparison = JSON.stringify({
      preserved: false,
      missingPoints: ['Point about C'],
      confidence: 0.95
    });

    documentContext.getContext.mockResolvedValue(mockContext);
    aiService.analyze
      .mockResolvedValueOnce(createCompleteAnalysisResult(mockOriginalKeyPoints))
      .mockResolvedValueOnce(createCompleteAnalysisResult(mockRewrite))
      .mockResolvedValueOnce(createCompleteAnalysisResult(mockRewrittenKeyPoints))
      .mockResolvedValueOnce(createCompleteAnalysisResult(mockComparison));

    await expect(handler.execute(command)).rejects.toThrow('Rewrite failed to preserve key points');

    // Verify all analysis steps were attempted
    expect(aiService.analyze).toHaveBeenCalledTimes(4);
  });

  test('should adjust style parameters based on intent', async () => {
    const command: SemanticRewriteCommand = {
      type: 'SEMANTIC_REWRITE',
      documentId: 'doc-1',
      userId: 'user-1',
      selectionStart: 0,
      selectionEnd: 100,
      intent: {
        tone: 'technical',
        style: 'detailed',
        audience: 'expert'
      },
      preserveKeyPoints: false,
      contextParameters: {
        windowSize: 500,
        includePreceding: true,
        includeFollowing: true,
        includeDocument: true
      },
      requiresAIAnalysis: true
    };

    const mockContext = {
      content: 'Original content to be rewritten'
    };

    documentContext.getContext.mockResolvedValue(mockContext);
    aiService.analyze.mockResolvedValueOnce(createCompleteAnalysisResult(
      'Technical and detailed rewrite',
      {
        temperature: 0.2,
        style: 'detailed'
      }
    ));

    const result = await handler.execute(command);

    // Verify style parameters were correctly applied
    expect(aiService.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.2,
        content: expect.any(String)
      })
    );
  });

  test('should maintain semantic context across document sections', async () => {
    const command: SemanticRewriteCommand = {
      type: 'SEMANTIC_REWRITE',
      documentId: 'doc-1',
      userId: 'user-1',
      selectionStart: 0,
      selectionEnd: 100,
      intent: {
        tone: 'technical',
        style: 'detailed',
        audience: 'expert'
      },
      contextParameters: {
        windowSize: 500,
        includePreceding: true,
        includeFollowing: true,
        preserveStructure: true,
        includeDocument: true
      },
      requiresAIAnalysis: true
    };

    const mockContext = {
      content: [
        '# Introduction',
        'Initial technical context.',
        '## Background',
        'More detailed information.',
        '# Implementation',
        'Technical implementation details.',
        '## Results',
        'Analysis of the results.'
      ].join('\n\n')
    };

    documentContext.getContext.mockResolvedValue(mockContext);
    aiService.analyze.mockResolvedValue(createCompleteAnalysisResult(
      'Rewritten technical content with preserved structure',
      {
        sectionMarkers: ['#', '##'],
        preservedHeadings: true
      }
    ));

    const result = await handler.execute(command);

    // Verify semantic structure preservation
    expect(aiService.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: expect.objectContaining({
          preserveStructure: true,
          sectionMarkers: expect.arrayContaining(['#', '##'])
        })
      })
    );

    expect(result.metadata.preservedStructure).toBe(true);
  });

  test('should handle cross-references and dependencies', async () => {
    const command: SemanticRewriteCommand = {
      type: 'SEMANTIC_REWRITE',
      documentId: 'doc-1',
      userId: 'user-1',
      selectionStart: 50,
      selectionEnd: 150,
      intent: {
        tone: 'technical',
        style: 'detailed',
        audience: 'expert'
      },
      contextParameters: {
        windowSize: 1000,
        includePreceding: true,
        includeFollowing: true,
        trackReferences: true,
        includeDocument: true
      },
      requiresAIAnalysis: true
    };

    const mockContext = {
      content: 'Content with references to [Figure 1] and [Table 2]. More content referencing previous [Figure 1].',
      references: [
        { type: 'figure', id: '1', position: 25 },
        { type: 'table', id: '2', position: 45 }
      ]
    };

    documentContext.getContext.mockResolvedValue(mockContext);
    aiService.analyze.mockResolvedValue(createCompleteAnalysisResult(
      'Rewritten content preserving [Figure 1] and [Table 2] references.',
      {
        preservedReferences: [
          { type: 'figure', id: '1' },
          { type: 'table', id: '2' }
        ]
      }
    ));

    const result = await handler.execute(command);

    // Verify reference preservation
    expect(result.metadata.preservedReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'figure', id: '1' }),
        expect.objectContaining({ type: 'table', id: '2' })
      ])
    );
  });

  test('should handle large content with streaming response', async () => {
    const command: SemanticRewriteCommand = {
      type: 'SEMANTIC_REWRITE',
      documentId: 'doc-1',
      userId: 'user-1',
      selectionStart: 0,
      selectionEnd: 5000, // Large selection
      intent: {
        tone: 'technical',
        style: 'detailed',
        audience: 'expert'
      },
      contextParameters: {
        windowSize: 2000,
        includePreceding: true,
        includeFollowing: true,
        streamResponse: true,
        includeDocument: true
      },
      requiresAIAnalysis: true
    };

    const mockContext = {
      content: 'A'.repeat(5000) // Large content
    };

    const streamingUpdates: string[] = [];
    const onProgress = (update: string) => streamingUpdates.push(update);

    documentContext.getContext.mockResolvedValue(mockContext);
    aiService.analyze.mockImplementation(async ({ onToken }) => {
      // Simulate streaming tokens
      const tokens = ['Chunk 1', 'Chunk 2', 'Chunk 3'];
      for (const token of tokens) {
        onToken?.(token);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return createCompleteAnalysisResult(tokens.join(''));
    });

    const result = await handler.execute(command, { onProgress });

    expect(streamingUpdates).toHaveLength(3);
    expect(streamingUpdates).toEqual(['Chunk 1', 'Chunk 2', 'Chunk 3']);
  });

  test('should validate semantic structure integrity', async () => {
    const command: SemanticRewriteCommand = {
      type: 'SEMANTIC_REWRITE',
      documentId: 'doc-1',
      userId: 'user-1',
      selectionStart: 50,
      selectionEnd: 150,
      intent: {
        tone: 'technical',
        style: 'detailed',
        audience: 'expert'
      },
      contextParameters: {
        windowSize: 1000,
        includePreceding: true,
        includeFollowing: true,
        validateStructure: true,
        includeDocument: true
      },
      requiresAIAnalysis: true
    };

    const mockContext = {
      content: 'Content with lists:\n- Item 1\n- Item 2\nAnd **bold** text',
      structure: {
        type: 'document',
        children: [
          { type: 'paragraph', start: 0, end: 19 },
          { type: 'list', start: 20, end: 40 },
          { type: 'paragraph', start: 41, end: 60 }
        ]
      }
    };

    documentContext.getContext.mockResolvedValue(mockContext);
    aiService.analyze.mockResolvedValue(createCompleteAnalysisResult(
      'Rewritten content preserving:\n- Item 1\n- Item 2\nWith **bold**',
      {
        structureValidation: {
          valid: true,
          preservedElements: ['list', 'bold']
        }
      }
    ));

    const result = await handler.execute(command);

    expect(result.metadata.structureValidation.valid).toBe(true);
    expect(result.metadata.structureValidation.preservedElements).toContain('list');
  });

  test('should provide alternative suggestions with confidence scores', async () => {
    const command: SemanticRewriteCommand = {
      type: 'SEMANTIC_REWRITE',
      documentId: 'doc-1',
      userId: 'user-1',
      selectionStart: 0,
      selectionEnd: 100,
      intent: {
        tone: 'technical',
        style: 'detailed',
        audience: 'expert',
        generateAlternatives: true,
        maxAlternatives: 3
      },
      contextParameters: {
        windowSize: 500,
        includePreceding: true,
        includeFollowing: true,
        includeDocument: true
      },
      requiresAIAnalysis: true
    };

    const mockContext = {
      content: 'Original technical content to be rewritten'
    };

    documentContext.getContext.mockResolvedValue(mockContext);
    aiService.analyze.mockResolvedValue(createCompleteAnalysisResult(
      'Primary technical rewrite',
      {
        alternatives: [
          {
            content: 'Alternative 1',
            confidence: 0.95,
            preservesIntent: true
          },
          {
            content: 'Alternative 2',
            confidence: 0.85,
            preservesIntent: true
          },
          {
            content: 'Alternative 3',
            confidence: 0.75,
            preservesIntent: false
          }
        ]
      }
    ));

    const result = await handler.execute(command);

    expect(result.alternatives).toHaveLength(3);
    expect(result.alternatives[0]).toMatchObject({
      content: expect.any(String),
      confidence: expect.any(Number),
      preservesIntent: expect.any(Boolean)
    });
  });

  describe('Collaborative AI Interactions', () => {
    test('should handle concurrent user edits during rewrite', async () => {
      const command: SemanticRewriteCommand = {
        type: 'SEMANTIC_REWRITE',
        documentId: 'doc-1',
        userId: 'user-1',
        selectionStart: 0,
        selectionEnd: 100,
        intent: {
          tone: 'technical',
          style: 'detailed',
          audience: 'expert'
        },
        contextParameters: {
          windowSize: 500,
          includePreceding: true,
          includeFollowing: true,
          trackCollaborativeChanges: true,
          includeDocument: true
        },
        requiresAIAnalysis: true
      };

      const mockContext = {
        content: 'Original content',
        collaborativeState: {
          activeUsers: ['user-1', 'user-2'],
          pendingChanges: [
            {
              userId: 'user-2',
              position: 50,
              type: 'INSERT',
              content: 'concurrent edit'
            }
          ]
        }
      };

      documentContext.getContext.mockResolvedValue(mockContext);
      aiService.analyze.mockResolvedValue(createCompleteAnalysisResult(
        'Rewritten with consideration of concurrent edits',
        {
          collaborativeAwareness: {
            consideredChanges: ['user-2:INSERT:50'],
            conflictResolution: 'MERGE'
          }
        }
      ));

      const result = await handler.execute(command);

      expect(result.metadata.collaborativeAwareness).toBeDefined();
      expect(result.metadata.collaborativeAwareness.consideredChanges).toContain('user-2:INSERT:50');
    });

    test('should adapt rewrite based on active user cursors', async () => {
      const command: SemanticRewriteCommand = {
        type: 'SEMANTIC_REWRITE',
        documentId: 'doc-1',
        userId: 'user-1',
        selectionStart: 0,
        selectionEnd: 100,
        intent: {
          tone: 'technical',
          style: 'detailed',
          audience: 'expert'
        },
        contextParameters: {
          windowSize: 500,
          includePreceding: true,
          includeFollowing: true,
          trackUserPresence: true,
          includeDocument: true
        },
        requiresAIAnalysis: true
      };

      const mockContext = {
        content: 'Content being edited by multiple users',
        collaborativeState: {
          userCursors: {
            'user-2': { position: 30, selecting: false },
            'user-3': { position: 60, selecting: true, selectionEnd: 75 }
          }
        }
      };

      documentContext.getContext.mockResolvedValue(mockContext);
      aiService.analyze.mockResolvedValue(createCompleteAnalysisResult(
        'Rewritten while preserving user cursor regions',
        {
          preservedRegions: [
            { start: 25, end: 35 }, // Around user-2's cursor
            { start: 55, end: 80 }  // Around user-3's selection
          ]
        }
      ));

      const result = await handler.execute(command);

      expect(result.metadata.preservedRegions).toBeDefined();
      expect(result.metadata.preservedRegions).toHaveLength(2);
    });

    test('should provide collaborative-aware suggestions', async () => {
      const command: SemanticRewriteCommand = {
        type: 'SEMANTIC_REWRITE',
        documentId: 'doc-1',
        userId: 'user-1',
        selectionStart: 0,
        selectionEnd: 100,
        intent: {
          tone: 'technical',
          style: 'detailed',
          audience: 'expert',
          collaborativeAware: true
        },
        contextParameters: {
          windowSize: 500,
          includePreceding: true,
          includeFollowing: true,
          includeDocument: true
        },
        requiresAIAnalysis: true
      };

      const mockContext = {
        content: 'Collaborative document content',
        collaborativeState: {
          activeUsers: ['user-1', 'user-2', 'user-3'],
          userIntents: {
            'user-2': { intent: 'REVIEWING', section: 'introduction' },
            'user-3': { intent: 'EDITING', section: 'conclusion' }
          }
        }
      };

      documentContext.getContext.mockResolvedValue(mockContext);
      aiService.analyze.mockResolvedValue(createCompleteAnalysisResult(
        'Collaboratively optimized rewrite',
        {
          suggestions: [
            {
              type: 'WAIT',
              reason: 'User-2 is currently reviewing this section',
              confidence: 0.9
            },
            {
              type: 'COORDINATE',
              message: 'Consider coordinating with User-3 on conclusion changes',
              confidence: 0.8
            }
          ]
        }
      ));

      const result = await handler.execute(command);

      expect(result.suggestions).toBeDefined();
      expect(result.suggestions).toContainEqual(
        expect.objectContaining({
          type: 'WAIT',
          reason: expect.stringContaining('User-2')
        })
      );
    });
  });

  test('should execute semantic rewrite with new parameters', async () => {
    const command: SemanticRewriteCommand = {
      type: 'SEMANTIC_REWRITE',
      documentId: 'doc-1',
      userId: 'user-1',
      position: 0,
      prompt: 'Rewrite this text',
      contextParameters: {
        windowSize: 100,
        includePreceding: true,
        includeFollowing: false,
        includeDocument: true // Add required parameter
      },
      analysisParameters: {
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 100
      },
      requiresAIAnalysis: true // Ensure this property exists in the type
    };

    const mockContext = {
      content: 'Original content to be rewritten'
    };

    documentContext.getContext.mockResolvedValue(mockContext);
    aiService.analyze.mockResolvedValueOnce(createCompleteAnalysisResult(
      'Rewritten content with new parameters',
      {
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 100
      }
    ));

    const result = await handler.execute(command);

    expect(result.text).toBe('Rewritten content with new parameters');
    expect(result.metadata).toMatchObject({
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 100
    });
  });
});