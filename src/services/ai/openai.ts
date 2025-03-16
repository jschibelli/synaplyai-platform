import { OpenAI } from 'openai';
import { AIService } from './base';
import { getCurrentTenantId } from '@/lib/tenantContext';

export class OpenAIService extends AIService {
  private client: OpenAI;
  private model: string;

  constructor(model: string = 'gpt-4o') {
    super();
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = model;
  }

  async generateContent(prompt: string, options: any = {}): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      ...options
    });

    return response.choices[0]?.message?.content || '';
  }

  async generateContentInternal(prompt: string, options: any = {}): Promise<string> {
    // Enhance prompt with tenant context to prevent data leakage
    const tenantId = getCurrentTenantId() || 'default-tenant';
    const enhancedPrompt = `[CONTEXT: You are responding to tenant: ${tenantId}] ${prompt}`;
    
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: enhancedPrompt }],
      ...options
    });

    return response.choices[0]?.message?.content || '';
  }
  
  async streamContentInternal(
    prompt: string,
    onToken: (token: string) => void,
    options: any = {}
  ): Promise<void> {
    // Enhance prompt with tenant context
    const tenantId = getCurrentTenantId() || 'default-tenant';
    const enhancedPrompt = `[CONTEXT: You are responding to tenant: ${tenantId}] ${prompt}`;
    
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: enhancedPrompt }],
      stream: true,
      ...options
    });
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        onToken(content);
      }
    }
  }

  getModelInfo() {
    // Model-specific information
    const modelData: Record<string, { contextWindow: number, costPer1KTokens: number }> = {
      'gpt-4o': { contextWindow: 128000, costPer1KTokens: 0.01 },
      'gpt-4': { contextWindow: 8192, costPer1KTokens: 0.03 }
      // Add other models as needed
    };

    return {
      name: this.model,
      ...modelData[this.model]
    };
  }
}