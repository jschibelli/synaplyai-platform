import { AIProvider } from '../../ai/AIService';

/**
 * Mock AI provider for testing and development
 */
export class MockAIProvider implements AIProvider {
  async getCompletion(prompt: string, options: any): Promise<{
    text: string;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    modelId: string;
  }> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Calculate token estimates
    const promptTokens = Math.ceil(prompt.length / 4);
    const completionTokens = 150; // Fixed for mock
    
    // Generate a mock response based on the prompt and type
    let response = this.generateMockResponse(prompt, options);
    
    return {
      text: response,
      totalTokens: promptTokens + completionTokens,
      promptTokens,
      completionTokens,
      modelId: options.model || 'mock-model'
    };
  }
  
  /**
   * Generate a mock response based on the prompt
   */
  private generateMockResponse(prompt: string, options: any): string {
    // Check for different command types to provide appropriate mock responses
    if (prompt.includes('grammar') || prompt.includes('CHECK_GRAMMAR')) {
      return "I've analyzed the text, and here are the grammar corrections:\n\n" +
             "1. Consider using 'their' instead of 'there' in the second paragraph.\n" +
             "2. The sentence starting with 'However' should have a comma after it.\n" +
             "3. The word 'definately' is misspelled - it should be 'definitely'.";
    }
    
    if (prompt.includes('sentiment') || prompt.includes('ANALYZE_SENTIMENT')) {
      return "Sentiment Analysis:\n\n" +
             "The text exhibits a predominantly positive sentiment (score: 0.72 on a scale of -1 to 1).\n" +
             "Key positive phrases include 'excellent results', 'impressive performance', and 'exceeds expectations'.\n" +
             "Some neutral phrasing was detected, but very few negative elements were present.";
    }
    
    if (prompt.includes('improve') || prompt.includes('SUGGEST_IMPROVEMENTS')) {
      return "Here are some suggested improvements for your text:\n\n" +
             "1. Consider a more engaging opening sentence to grab the reader's attention.\n" +
             "2. The third paragraph could be more concise - try removing redundant phrases.\n" +
             "3. Add specific examples to support your main argument.\n" +
             "4. The conclusion could more effectively summarize your key points.";
    }
    
    if (prompt.includes('complete') || prompt.includes('COMPLETE_TEXT')) {
      return "The system architecture leverages a distributed processing model with fault tolerance built in at every layer. This ensures that even during partial outages, critical business functions remain operational. The redundant design incorporates automatic failover mechanisms that can detect and respond to component failures within milliseconds, providing enterprise-grade reliability for mission-critical applications.";
    }
    
    if (prompt.includes('rewrite') || prompt.includes('REWRITE_SELECTION')) {
      return "The architecture employs advanced distributed processing with comprehensive fault tolerance mechanisms. This design ensures operational continuity during system disruptions, preserving essential business functions. With redundant components featuring millisecond-speed failover detection and response, the system delivers the enterprise-level reliability necessary for mission-critical operations.";
    }
    
    // Default response for other commands
    return "I've analyzed your document and have the following insights:\n\n" +
           "The content is well-structured but could benefit from more specific examples.\n" +
           "Consider reorganizing the second section to improve flow.\n" +
           "The conclusion effectively summarizes the key points but could be more actionable.";
  }
}