import { AICommand, AICommandHandler } from '../../AICommandRegistry';
import { DocumentContext, AIAnalysisResult } from '../../../types/shared-interfaces';

export interface SemanticRewriteCommand extends AICommand {
  type: 'SEMANTIC_REWRITE';
  documentId: string;
  userId: string;
  selectionStart: number;
  selectionEnd: number;
  intent: {
    tone?: 'formal' | 'casual' | 'technical';
    style?: 'concise' | 'detailed' | 'balanced';
    audience?: 'expert' | 'general' | 'beginner';
    generateAlternatives?: boolean;
    collaborativeAware?: boolean;
    [key: string]: any; // Allow additional properties for testing
  };
  contextParameters: {
    windowSize: number;
    includePreceding: boolean;
    includeFollowing: boolean;
    includeDocument: boolean;
    trackReferences?: boolean;
    trackCollaborativeChanges?: boolean;
    streamResponse?: boolean;
    validateStructure?: boolean;
    trackUserPresence?: boolean;
    [key: string]: any; // Allow additional properties for testing
  };
}

export class SemanticRewriteCommandHandler implements AICommandHandler<SemanticRewriteCommand> {
  constructor(private aiService: any, private documentContext: any) {}

  async execute(command: SemanticRewriteCommand): Promise<any> {
    const context = await this.documentContext.getContext(command.documentId, command.contextParameters);
    
    const analysisParams = {
      preserveStructure: true,
      sectionMarkers: ['#', '##', '###', '####', '#####', '######'],
      tone: command.intent.tone,
      style: command.intent.style,
      audience: command.intent.audience,
      // Allow passing additional parameters from tests
      ...command.intent
    };
    
    // Create function to handle streaming if needed
    const contextWithCallbacks = {
      ...context,
      onToken: command.contextParameters.streamResponse ? 
        (token: string) => console.log(`Streaming token: ${token}`) : undefined
    };
    
    const analysis = await this.aiService.analyze(contextWithCallbacks, analysisParams);
    
    return {
      documentId: command.documentId,
      selectionStart: command.selectionStart,
      selectionEnd: command.selectionEnd,
      originalText: context.selectedText,
      newText: analysis.content,
      userId: command.userId,
      aiGenerated: true,
      modelId: analysis.modelId,
      metadata: {
        preservedStructure: true,
        ...analysis.metadata
      }
    };
  }
}