import { ContentFilter } from './contentFilter';

export abstract class AIService {
  protected contentFilter: ContentFilter;
  
  constructor() {
    this.contentFilter = new ContentFilter();
  }
  
  async generateContent(prompt: string, options?: any): Promise<string> {
    // Check if the prompt passes content filtering
    const filterResult = await this.contentFilter.filterContent(prompt);
    if (!filterResult.isAllowed) {
      throw new Error(`Content not allowed: ${filterResult.reasons.join(', ')}`);
    }
    
    // Generate content using the specific service implementation
    const content = await this.generateContentInternal(prompt, options);
    
    // Check if the response passes content filtering
    const responseFilter = await this.contentFilter.filterContent(content);
    if (!responseFilter.isAllowed) {
      throw new Error(`Generated content not allowed: ${responseFilter.reasons.join(', ')}`);
    }
    
    return content;
  }
  
  async streamContent(
    prompt: string,
    onToken: (token: string) => void,
    options?: any
  ): Promise<void> {
    // Check if the prompt passes content filtering
    const filterResult = await this.contentFilter.filterContent(prompt);
    if (!filterResult.isAllowed) {
      throw new Error(`Content not allowed: ${filterResult.reasons.join(', ')}`);
    }
    
    // Buffer to accumulate tokens for post-filtering
    let buffer = '';
    
    // Wrap the original onToken callback to apply post-filtering
    const wrappedOnToken = async (token: string) => {
      buffer += token;
      
      // Only send tokens to client after checking the accumulated content
      // In a real-world implementation, you might use a more sophisticated approach
      // to avoid checking the entire buffer on each token
      const bufferResult = await this.contentFilter.filterContent(buffer);
      if (bufferResult.isAllowed) {
        onToken(token);
      } else {
        // If at any point the buffer contains disallowed content, stop streaming
        throw new Error(`Generated content not allowed: ${bufferResult.reasons.join(', ')}`);
      }
    };
    
    // Stream content using the specific service implementation
    await this.streamContentInternal(prompt, wrappedOnToken, options);
  }
  
  abstract generateContentInternal(prompt: string, options?: any): Promise<string>;
  
  abstract streamContentInternal(
    prompt: string,
    onToken: (token: string) => void,
    options?: any
  ): Promise<void>;
  
  abstract getModelInfo(): { 
    name: string;
    contextWindow: number;
    costPer1KTokens: number;
  };
}