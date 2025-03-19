import { AICommand, AICommandHandler } from '../AICommandRegistry';
import { DocumentContext } from '../../context/DocumentContext';
import { AIAnalysisResult } from '../../ai/AIService';

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
  };
  preserveKeyPoints: boolean;
  contextParameters: {
    windowSize: number;
    includePreceding: boolean;
    includeFollowing: boolean;
    includeDocument: boolean;
  };
}

export class SemanticRewriteCommandHandler implements AICommandHandler<SemanticRewriteCommand> {
  constructor(
    private aiService: AIService,
    private documentContext: DocumentContext
  ) {}

  async execute(command: SemanticRewriteCommand): Promise<AIAnalysisResult> {
    // Extract document context
    const context = await this.documentContext.getContext({
      documentId: command.documentId,
      selectionStart: command.selectionStart,
      selectionEnd: command.selectionEnd,
      ...command.contextParameters
    });

    // Build semantic rewrite prompt
    const prompt = this.buildSemanticPrompt(command, context);

    // Get AI analysis
    const analysis = await this.aiService.analyze({
      content: context.content,
      prompt: prompt,
      model: 'gpt-4',
      temperature: this.getToneTemperature(command.intent.tone),
      maxTokens: this.calculateTokenLimit(context.content.length)
    });

    // Process and validate rewrite
    return this.processRewrite(analysis, command, context);
  }

  private buildSemanticPrompt(command: SemanticRewriteCommand, context: DocumentContext): string {
    const { tone, style, audience } = command.intent;
    const basePrompt = `Rewrite the selected text to be more ${tone || 'balanced'} in tone, ${style || 'balanced'} in style`;
    
    const audiencePrompt = audience ? 
      ` and targeted at a ${audience} audience` : '';
    
    const preservationPrompt = command.preserveKeyPoints ?
      '\nMaintain these key points and concepts from the original text: ' +
      this.extractKeyPoints(context.content) : '';

    return `${basePrompt}${audiencePrompt}.${preservationPrompt}`;
  }

  private getToneTemperature(tone?: string): number {
    switch (tone) {
      case 'formal': return 0.3;
      case 'casual': return 0.7;
      case 'technical': return 0.2;
      default: return 0.5;
    }
  }

  private calculateTokenLimit(contentLength: number): number {
    // Dynamic token limit based on content length
    return Math.min(Math.max(contentLength * 1.5, 100), 1000);
  }

  private async processRewrite(
    analysis: AIAnalysisResult, 
    command: SemanticRewriteCommand,
    context: DocumentContext
  ): Promise<AIAnalysisResult> {
    // Validate the rewrite maintains key points if required
    if (command.preserveKeyPoints) {
      const keyPointsPreserved = await this.validateKeyPoints(
        context.content,
        analysis.text
      );
      
      if (!keyPointsPreserved) {
        throw new Error('Rewrite failed to preserve key points');
      }
    }

    return {
      ...analysis,
      metadata: {
        tone: command.intent.tone,
        style: command.intent.style,
        audience: command.intent.audience,
        keyPointsPreserved: command.preserveKeyPoints
      }
    };
  }

  private async extractKeyPoints(content: string): Promise<string> {
    // Use AI service to extract key points
    const keyPointAnalysis = await this.aiService.analyze({
      content,
      prompt: "Extract the main key points from this text. Return them as a numbered list.",
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 300
    });

    return keyPointAnalysis.text;
  }

  private async validateKeyPoints(originalContent: string, rewrittenContent: string): Promise<boolean> {
    // Extract key points from both versions
    const originalPoints = await this.extractKeyPoints(originalContent);
    const rewrittenPoints = await this.extractKeyPoints(rewrittenContent);

    // Compare key points using AI for semantic similarity
    const comparisonAnalysis = await this.aiService.analyze({
      content: `Original key points:\n${originalPoints}\n\nRewritten key points:\n${rewrittenPoints}`,
      prompt: `
        Analyze if the rewritten text maintains all key points from the original.
        Consider semantic meaning, not exact wording.
        Return a JSON object with:
        {
          "preserved": boolean,
          "missingPoints": string[],
          "confidence": number
        }
      `,
      model: 'gpt-4',
      temperature: 0.2,
      maxTokens: 200
    });

    try {
      const result = JSON.parse(comparisonAnalysis.text);
      
      // Log missing points for debugging and user feedback
      if (!result.preserved && result.missingPoints.length > 0) {
        console.warn('Key points not preserved:', {
          command: 'SEMANTIC_REWRITE',
          missingPoints: result.missingPoints,
          confidence: result.confidence
        });
      }

      // Only consider preserved if confidence is high enough
      return result.preserved && result.confidence >= 0.8;
    } catch (error) {
      console.error('Failed to parse key points validation result:', error);
      return false;
    }
  }
}