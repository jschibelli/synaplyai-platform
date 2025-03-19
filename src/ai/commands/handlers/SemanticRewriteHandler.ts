import { AICommandHandler } from '../AICommandRegistry';
import { SemanticRewriteParameters, SemanticRewriteResult, DocumentContext } from '../../types';
import { AIService } from '../../services/AIService';
import { ContentFilterPipeline } from '../../../compliance/filters/ContentFilterPipeline';
import { TokenUsageTracker } from '../../../usage/TokenUsageTracker';

/**
 * Handles semantic rewriting of text with support for different styles and tones
 */
export class SemanticRewriteHandler implements AICommandHandler<SemanticRewriteParameters, SemanticRewriteResult> {
  constructor(
    private aiService: AIService,
    private filterPipeline: ContentFilterPipeline,
    private tokenUsageTracker: TokenUsageTracker
  ) {}

  /**
   * Executes a semantic rewrite command
   */
  async execute(parameters: SemanticRewriteParameters, context: DocumentContext): Promise<SemanticRewriteResult> {
    const { text, targetStyle, tone, level } = parameters;
    const tenantId = context.tenantContext.tenantId;
    
    // Prepare the instruction based on parameters
    const instruction = this.buildInstruction(targetStyle, tone, level);
    
    // Get the selected content or context
    const contentToRewrite = text || context.precedingText;
    
    if (!contentToRewrite) {
      throw new Error('No content provided for rewriting');
    }
    
    // Filter the input text through compliance pipeline
    const filterResult = await this.filterPipeline.process(contentToRewrite);
    if (filterResult.result === 'BLOCKED') {
      throw new Error(`Content filter blocked input: ${filterResult.reason}`);
    }
    
    // Reserve estimated tokens
    const estimatedTokens = this.estimateTokens(contentToRewrite, instruction);
    await this.tokenUsageTracker.reserveTokens(tenantId, estimatedTokens);
    
    // Prepare AI prompt
    const prompt = `
    I need you to rewrite the following text ${instruction}.
    Maintain the original meaning and key information, but adjust the writing style accordingly.
    
    Original text:
    """
    ${contentToRewrite}
    """
    
    Rewritten text:
    `;
    
    // Execute AI operation
    const result = await this.aiService.generateText(prompt, {
      temperature: this.getTemperatureForStyle(targetStyle),
      maxTokens: Math.min(estimatedTokens * 1.5, 2000),
      tenantId
    });
    
    // Filter the generated content
    const responseFilter = await this.filterPipeline.process(result.text);
    if (responseFilter.result === 'BLOCKED') {
      throw new Error(`Content filter blocked generated content: ${responseFilter.reason}`);
    }
    
    // Track actual token usage
    await this.tokenUsageTracker.trackUsage(
      tenantId,
      result.promptTokens,
      result.completionTokens,
      result.modelId
    );
    
    return {
      rewrittenText: result.text,
      originalText: contentToRewrite,
      style: targetStyle,
      tone: tone,
      modelId: result.modelId,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens
    };
  }
  
  /**
   * Builds instruction string based on style and tone parameters
   */
  private buildInstruction(style?: string, tone?: string, level: number = 1): string {
    const styleMap: Record<string, string> = {
      professional: 'in a professional and business-appropriate style',
      academic: 'in an academic style with formal language and precise terminology',
      conversational: 'in a conversational, approachable style',
      technical: 'in a technical style with proper terminology',
      creative: 'in a creative and engaging style',
      simplified: 'in a simplified, easy-to-understand style'
    };
    
    const toneMap: Record<string, string> = {
      formal: 'with a formal tone',
      casual: 'with a casual tone',
      enthusiastic: 'with an enthusiastic tone',
      persuasive: 'with a persuasive tone',
      neutral: 'with a neutral tone',
      authoritative: 'with an authoritative tone'
    };
    
    const levelDescriptor = level > 2 ? 'significantly' : level > 1 ? 'moderately' : 'slightly';
    
    let instruction = '';
    
    if (style && styleMap[style]) {
      instruction += styleMap[style];
    }
    
    if (tone && toneMap[tone]) {
      instruction += ' ' + toneMap[tone];
    }
    
    if (instruction) {
      instruction = `${levelDescriptor} ${instruction}`;
    } else {
      instruction = 'to improve clarity and flow while preserving the meaning';
    }
    
    return instruction;
  }
  
  /**
   * Determines appropriate temperature setting based on target style
   */
  private getTemperatureForStyle(style?: string): number {
    if (!style) return 0.7; // Default temperature
    
    const temperatureMap: Record<string, number> = {
      professional: 0.5,
      academic: 0.4,
      conversational: 0.8,
      technical: 0.5,
      creative: 0.9,
      simplified: 0.6
    };
    
    return temperatureMap[style] || 0.7;
  }
  
  /**
   * Estimates token usage for the operation
   */
  private estimateTokens(text: string, instruction: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    const promptLength = (text.length + instruction.length) / 4;
    // Estimate completion as similar size to input
    const estimatedCompletion = text.length / 4;
    
    return Math.ceil(promptLength + estimatedCompletion);
  }
}